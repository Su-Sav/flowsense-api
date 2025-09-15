
# FlowSense API

[![CI](https://github.com/Su-Sav/flowsense-api/actions/workflows/ci-cd.yml/badge.svg?branch=main)](https://github.com/Su-Sav/flowsense-api/actions/workflows/ci-cd.yml)
[![Smoke](https://github.com/Su-Sav/flowsense-api/actions/workflows/smoke.yml/badge.svg?branch=main)](https://github.com/Su-Sav/flowsense-api/actions/workflows/smoke.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)


Semantic error analysis for SAP CPI: klassifiziert Fehlerkontexte (LLM + JSON Schema) und liefert deterministische Entscheidungen (retry · park · incident) für Router & Audit.

**Status:** Prototype (hardened for pilot use).  
Details siehe [`docs/security.md`](./docs/security.md) und [`docs/operations.md`](./docs/operations.md).

>End-to-End-Integration:
Diese API integriert sich in SAP CPI und ermöglicht eine intelligente Fehlerbehandlung. Vollständige Integrationsmuster und Pilotergebnisse finden Sie in der 



## Endpoints

- `GET /` – Meta (Name, Auth-Status)
- `GET /health` – **Liveness** (keine Downstream-/OpenAI-Prüfung)
- `POST /analyze-error` – Fehlerkontext analysieren → strukturierte JSON-Entscheidung  
  Auth: in Stage/Prod Pflicht (OAuth2/XSUAA, Scope `<XSAPPNAME>.flowsense.execute`)
- `GET /cb-state` – Circuit-Breaker-Status (**Dev-only**; sichtbar nur bei `EXPOSE_DEBUG_ENDPOINTS=true`)



## Security 

- Auth: OAuth2 Client Credentials (XSUAA), Scope `<XSAPPNAME>.flowsense.execute`
- Optional: `ALLOWED_CLIENT_IDS` (Allow-List bekannter CPI-Clients)
- Transport: TLS (BTP/CF)
- Details: siehe [`docs/security.md`](./docs/security.md)

---

## Resilience

- Timeout für LLM-Aufruf, strikte Response-Validierung (AJV, `additionalProperties:false`)
- Circuit Breaker pro Instanz (Threshold/Cooldown via ENV)
- Rule-based Fallback bei Timeout/Schemafehler
- Rate Limiting: Rate Limiting: app-weit 120 Requests pro 60 s 
- Details & Betrieb: [`docs/operations.md`](./docs/operations.md)  
- Fehlerbilder: [`docs/troubleshooting.md`](./docs/troubleshooting.md)

---

## Quickstart

- Lokal (Dev): `npm run dev` – Auth deaktiviert (`DISABLE_AUTH=true`)
- Stage/Prod: `npm start` – Auth aktiv (XSUAA Service Binding)
- Cloud Foundry: Deployment siehe [`docs/operations.md#7-deployment-hinweise-cf`](./docs/operations.md#7-deployment-hinweise-cf)

---

## Run locally (dev)

Für lokale Tests ohne echten OpenAI-Key kann ein Dummy-Key verwendet werden:

```bash
export OPENAI_API_KEY=dummy
DISABLE_AUTH=true OPENAI_TIMEOUT_MS=1 node server.mjs
# -> http://localhost:3000/health  {"status":"ok"}
# -> POST /analyze-error liefert deterministischen Fallback
````

---

## Smoke Test

Es existiert ein Skript für einen minimalen Smoke-Test (Health + Fallback):

```bash
npm run smoke
```

Dieses startet die API mit Dummy-Key, prüft `/health` und ruft `/analyze-error` mit einem Testpayload auf.

---

## Spezifikation & Tests

* OpenAPI: [`openapi.yaml`](./openapi.yaml)
* Curl-Beispiele: [`docs/tests.md`](./docs/tests.md)
* Architektur-Entscheidungen: [`docs/adr/ADR-0001-circuit-breaker.md`](./docs/adr/ADR-0001-circuit-breaker.md), [`docs/adr/ADR-0002-debug-endpoints.md`](./docs/adr/ADR-0002-debug-endpoints.md)

---

## Architektur & Deep Dive

* Kurzüberblick: [`docs/architecture.md`](./docs/architecture.md)
* CPI-Integration: Notion (Link einfügen)

---

## Environment

Beispiel `.env.example`:

```env
# Required for startup (dummy ok for fallback tests)
OPENAI_API_KEY=

# Dev-only
DISABLE_AUTH=true
OPENAI_TIMEOUT_MS=1
```

---

## Prototype Status & Limitations

* **Prototype, hardened for pilot use**
* LLM-Aufrufe können mit Dummy-Key simuliert werden (Timeout → deterministischer Fallback)
* Kein persistenter Circuit Breaker (pro Instanz, Memory-basiert)
* Authentifizierung: XSUAA/JWT in Stage/Prod Pflicht, lokal via `DISABLE_AUTH=true` deaktivierbar
* Smoke-Test deckt Health & Fallback ab; keine End-to-End-Live-Tests im Repo enthalten

