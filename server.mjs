import 'dotenv/config';
import express from 'express';
import Mustache from 'mustache';
import Ajv from 'ajv';
import OpenAI from 'openai';
import passport from 'passport';
import xsenv from '@sap/xsenv';
import xssec from '@sap/xssec';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const { JWTStrategy } = xssec;

const app = express();
app.use(express.json({ limit: '512kb' }));
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// ------------------------
// Auth Toggle
// ------------------------
const USE_AUTH = process.env.DISABLE_AUTH !== 'true';

// ------------------------
// XSUA / Passport Setup
// ------------------------
let services = null;
if (USE_AUTH) {
  xsenv.loadEnv();
  services = xsenv.getServices({ uaa: { tag: 'xsuaa' } });
  passport.use(new JWTStrategy(services.uaa));
  app.use(passport.initialize());
}

// ------------------------
// Scope Enforcement
// ------------------------
const requireScope = (scope) => (req, res, next) => {
  const info = req.authInfo;
  if (info && info.checkLocalScope && info.checkLocalScope(scope)) return next();
  return res.status(403).json({ error: 'insufficient_scope', required: scope });
};

// ------------------------
// Optional Allowlist für Client-IDs
// ------------------------
const ALLOWED_CLIENT_IDS = (process.env.ALLOWED_CLIENT_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allowClient = (req, res, next) => {
  if (!ALLOWED_CLIENT_IDS.length || !USE_AUTH) return next();
  const clientId = req.authInfo?.getClientId?.();
  if (clientId && ALLOWED_CLIENT_IDS.includes(clientId)) return next();
  return res.status(403).json({ error: 'unauthorized_client' });
};

// ------------------------
// OpenAI Client
// ------------------------
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ------------------------
// Fallback-Regelwerk (deterministisch)
// ------------------------
const FALLBACK_DEFAULT_MAX_ATTEMPTS = parseInt(process.env.FS_MAX_ATTEMPTS_DEFAULT || '6', 10);
function classifyFallback(ctx, reason = 'fallback') {
  const s = parseInt(ctx.httpStatus || '0', 10);
  const is4xx = s >= 400 && s < 500;
  const is5xx = s >= 500 && s < 600;
  const type =
    (s === 401 || s === 403) ? 'authentication' :
    (s === 408 || s === 429 || is5xx) ? 'connectivity' :
    (is4xx ? 'payload_mapping' : 'unknown');
  const retry = (type === 'connectivity');
  const after = retry ? 60 : 0;
  const max = retry ? FALLBACK_DEFAULT_MAX_ATTEMPTS : 0;
  return {
    flow: ctx.flow || 'UnknownFlow',
    type,
    description: `Rule-based decision (${reason}) for status ${s}`,
    root_causes: [reason, `http_status=${s}`, `step=${ctx.stepName||''}`].filter(Boolean),
    suggested_fix: retry
      ? ['Retry with exponential backoff', 'Check downstream health & credentials']
      : ['Review payload/mapping', 'Correct master data and reprocess'],
    retry_hint: { allowed: retry, after_seconds: after, max_attempts: max },
    requires_manual: !retry && is4xx,
    signals: {
      http_status: String(s || ''),
      target_system: ctx.targetSystem || '',
      step: ctx.stepName || ''
    }
  };
}

// ------------------------
// Circuit Breaker (process-local)
// ------------------------
const CB = {
  fails: 0,
  threshold: parseInt(process.env.CB_THRESHOLD || '3', 10),
  cooldownMs: parseInt(process.env.CB_COOLDOWN_MS || '60000', 10),
  openUntil: 0
};
const breakerOpen = () => Date.now() < CB.openUntil;
const recordFailure = () => {
  CB.fails++;
  if (CB.fails >= CB.threshold) CB.openUntil = Date.now() + CB.cooldownMs;
};
const recordSuccess = () => { CB.fails = 0; CB.openUntil = 0; };

// ------------------------
// Prompt-Template (Mustache)
// ------------------------
const TEMPLATE = `
You are an SAP Integration Suite (CPI) expert.
Analyze the following CPI error context and respond STRICTLY as valid JSON with these keys:
{
  "flow": "<string>",
  "type": "<one of: authentication, authorization, connectivity, business, payload_mapping, duplicate, configuration, unknown>",
  "description": "<clear explanation for L2 support>",
  "root_causes": ["<short bullets>"],
  "suggested_fix": ["<ordered steps>"],
  "retry_hint": { "allowed": <true|false>, "after_seconds": <int>, "max_attempts": <int> },
  "requires_manual": <true|false>,
  "signals": { "http_status": "<string|empty>", "target_system": "<string|empty>", "step": "<string|empty>" }
}

CPI Context:
Flow: {{flow}}
Step: {{stepName}}
Target system: {{targetSystem}}
HTTP status: {{httpStatus}}
Timestamp: {{timestamp}}
Attempts: {{attempts}}
Error message:
{{errorMessage}}
`;

// ------------------------
// JSON Schema (AJV) für strikte Validierung
// ------------------------
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    flow: { type: "string", minLength: 1 },
    type: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    root_causes: {
      type: "array",
      items: { type: "string", minLength: 1 },
      minItems: 1
    },
    suggested_fix: {
      type: "array",
      items: { type: "string", minLength: 1 },
      minItems: 1
    },
    retry_hint: {
      type: "object",
      properties: {
        allowed: { type: "boolean" },
        after_seconds: { type: "integer", minimum: 0 },
        max_attempts: { type: "integer", minimum: 0 }
      },
      required: ["allowed", "after_seconds", "max_attempts"],
      additionalProperties: false
    },
    requires_manual: { type: "boolean" },
    signals: {
      type: "object",
      properties: {
        http_status: { type: "string" },
        target_system: { type: "string" },
        step: { type: "string" }
      },
      required: ["http_status", "target_system", "step"],
      additionalProperties: false
    }
  },
  required: [
    "flow",
    "type",
    "description",
    "root_causes",
    "suggested_fix",
    "retry_hint",
    "requires_manual",
    "signals"
  ]
};

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(RESPONSE_SCHEMA);

// ------------------------
// Schutz-Wrapper für Routen
// ------------------------
const protect = (handlers = []) => {
  if (!USE_AUTH) return handlers;
  return [
    passport.authenticate('JWT', { session: false }),
    requireScope((process.env.XSAPPNAME || 'flowsense-api') + '.flowsense.execute'),
    allowClient,
    ...handlers
  ];
};

// ------------------------
// Health / Root
// ------------------------
app.get('/', (_req, res) => {
  res.json({ name: 'FlowSense API', auth: USE_AUTH ? 'enabled' : 'disabled' });
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

if (process.env.EXPOSE_DEBUG_ENDPOINTS === 'true') {
  app.get('/cb-state', (_req, res) =>
    res.json({ open: breakerOpen(), fails: CB.fails, openUntil: CB.openUntil })
  );
}

// ------------------------
// Main Endpoint
// ------------------------
app.post('/analyze-error', ...protect([
  async (req, res) => {
    try {
      if (breakerOpen()) {
        return res.json(classifyFallback(req.body || {}, 'circuit_open'));
      }

      const {
        flow = "UnknownFlow",
        stepName = "",
        targetSystem = "",
        httpStatus = "",
        timestamp = new Date().toISOString(),
        errorMessage = "",
        attempts = 0
      } = req.body || {};

      const rendered = Mustache.render(TEMPLATE, {
        flow, stepName, targetSystem, httpStatus, timestamp, errorMessage, attempts
      });

      // Responses-API mit Timeout
      const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '8000', 10);
      const aiCall = client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: rendered,
        text: {
          format: {
            type: "json_schema",
            name: "cpi_error_analysis_v1",
            schema: RESPONSE_SCHEMA,
            strict: true
          }
        }
      });
      const r = await Promise.race([
        aiCall,
        new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), timeoutMs))
      ]);

      const text =
        r.output_text ??
        r.output?.[0]?.content?.[0]?.text ??
        r.content?.[0]?.text ??
        "";

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }

      if (!validate(json)) {
        recordFailure();
        const fb = classifyFallback({ flow, stepName, targetSystem, httpStatus }, 'schema_invalid');
        return res.json(fb);
      }

      recordSuccess();

      // Safety defaulting, falls LLM max_attempts=0/undefined liefert
      if (!json.retry_hint || typeof json.retry_hint.max_attempts !== 'number') {
        json.retry_hint = { allowed: false, after_seconds: 0, max_attempts: FALLBACK_DEFAULT_MAX_ATTEMPTS };
      } else if (json.retry_hint.allowed && json.retry_hint.max_attempts === 0) {
        json.retry_hint.max_attempts = FALLBACK_DEFAULT_MAX_ATTEMPTS;
      }

      return res.json(json);
    } catch (err) {
      recordFailure();
      const fb = classifyFallback(req.body || {}, err?.message || 'upstream_failure');
      return res.json(fb);
    }
  }
]));

// ------------------------
// Server Start
// ------------------------
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`FlowSense API listening on :${port} (auth: ${USE_AUTH ? 'enabled' : 'disabled'})`)
);
