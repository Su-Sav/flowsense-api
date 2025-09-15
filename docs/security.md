
# Security Guidelines — FlowSense API

Dieses Dokument beschreibt die Sicherheitsmaßnahmen der FlowSense API und wie sie in **Dev**, **Stage** und **Prod** betrieben wird.

---

## 1) Kontext

Die Sicherheitsmaßnahmen der FlowSense API adressieren typische Risiken wie unbefugten Zugriff auf Endpunkte (z. B. `/analyze-error`), Information Disclosure durch Debug-/State-Endpunkte, Missbrauch oder DoS bei hoher Request-Last, unsicheren Umgang mit Secrets sowie unsichere Transportwege zwischen CPI und API.

---

## 2) Authentifizierung & Autorisierung

### Modi

* **Dev (lokal):** `DISABLE_AUTH=true` → Auth **deaktiviert** (nur lokal verwenden).
* **Prod/Stage (BTP CF):** OAuth2 **Client Credentials** gegen **XSUAA**.

  * Erwartet: **JWT** mit Scope
    `"<XSAPPNAME>.flowsense.execute"`

### Durchsetzung

* **Passport + XSUAA JWTStrategy** validiert Token.
* **Scope-Check** (Middleware `requireScope(scope)`)
* **Optionale Allowlist** via `ALLOWED_CLIENT_IDS` (kommasepariert) — zusätzliche Schutzschicht für bekannte CPI-Clients.

---

## 3) Transport & Netzwerk

* **TLS:** Standard in SAP BTP / Cloud Foundry (TLS-terminiert am Router).
* **Empfehlung:** Zugriff nur über **API Management** / IP-Restriktion des Subaccounts.
* **Kein Plain HTTP** nach außen; interne Systeme nur **https** aufrufen.

---

## 4) Debug-/State-Endpunkte

* **Default:** **nicht** exponieren.
* **Feature-Flag:** `EXPOSE_DEBUG_ENDPOINTS=true` aktiviert z. B. `/cb-state` **nur in Dev**.
  In Prod/Stage **unset/false** → Endpoint existiert nicht (404).
* Begründung: Minimiert **Information Disclosure** (siehe ADR-0002).

---

## 5) Rate Limiting & Hardening

* **Rate Limit** pro Route: `RATE_LIMIT_MAX` (Default 120), Fenster `RATE_LIMIT_WINDOW_MS` (Default 60000).
* **Helmet** aktiviert (Security-Header, `X-Powered-By` entfernt).
* **Timeouts** für Upstream-LLM: `OPENAI_TIMEOUT_MS` (Default 8000 ms).

---

## 6) Eingabenvalidierung & Antwortformate

* **AJV** validiert LLM-Output strikt gegen **`RESPONSE_SCHEMA`** (no additionalProperties).
* **Fallback** bei Invalidität/Timeout (deterministisches Regelwerk) → verhindert unsichere/inkonsistente Antworten.
* **JSON only**; keine dynamischen Ausführungen oder Templates aus Userdaten.

---

## 7) Geheimnisse & Konfiguration

* **Keine Secrets im Repo.** `.env` **nicht** commiten.
* **XSUAA**-Credentials nur über **Service Keys** / CF-Vars bereitstellen.
* **Rotation**: API Keys (OpenAI/XSUAA) regelmäßig drehen; Rollout via Pipelines.
* **Least Privilege:** Scope nur für benötigte Flows vergeben.

---

## 8) Logging & Datenschutz

* **Keine PII**/Kundendaten in Logs. Maskieren von Token/Secrets.
* **Log-Inhalte (Empfehlung):** `flow`, `step`, `http_status`, `decision` (type/retry/manual), Fehlercodes/Timeouts.
* **Fehlerausgabe:** In Prod **keine Stacktraces** an den Client zurückgeben.
* **Retention:** Logs nach Vorgaben des Mandanten/Unternehmens aufbewahren/löschen.

---

## 9) Betriebsrichtlinien

* **Dev:** `npm run dev` (setzt `DISABLE_AUTH=true`), optional `EXPOSE_DEBUG_ENDPOINTS=true`.
* **Prod:** `npm start` (Auth aktiv), `EXPOSE_DEBUG_ENDPOINTS` **nicht** setzen.
* **Health:** `/health` öffentlich ok; `/` gibt nur minimalen Status aus.
* **Circuit Breaker:** pro Instanz (siehe ADR-0001); State **nicht** offenlegen (außer Dev).

---

## 10) CI/CD & Abhängigkeiten

* **Secrets** nur als **CI-Variablen**/BTP Service Keys injizieren.
* **Dependency-Hygiene:** regelmäßige Updates; SCA/`npm audit` in Pipeline.
* **OpenAI SDK:** `>= 5.13.0` (Responses API-Unterstützung).

---

## 11) CORS (falls Browser-Clients geplant)

* Standard: **CORS aus** (nur Server-zu-Server, z. B. CPI).
* Falls nötig: explizit **Allow-List** der Origins, nur benötigte Methoden/Headers freigeben.

---



