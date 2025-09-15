# Troubleshooting — FlowSense API

Dieses Dokument listet typische Fehlerbilder bei der Nutzung der FlowSense API auf und beschreibt konkrete Schritte zur Behebung.

---

## 1) AI Timeout (AI_TIMEOUT)

**Symptom**  
`/analyze-error` liefert Fallback-Response mit  
`"description": "Rule-based decision (AI_TIMEOUT)..."`.

**Systemverhalten**  
- LLM-Antwort nicht rechtzeitig empfangen.  
- Circuit Breaker zählt Failure hoch.  
- Deterministische Rule-based Klassifikation wird zurückgegeben.  
- Retry findet **nicht in der API**, sondern nur beim aufrufenden Client (z. B. CPI) statt.  

**Operator Action**  
- Connectivity zu OpenAI prüfen.  
- Timeout-Einstellung (`OPENAI_TIMEOUT_MS`) ggf. erhöhen.  
- Bei wiederholten Fällen: Modell/Quota prüfen.

---

## 2) Schema Invalid

**Symptom**  
Antwort enthält Fallback mit `"reason": "schema_invalid"`.

**Systemverhalten**  
- LLM-Antwort nicht JSON-konform.  
- Validierung via AJV schlägt fehl.  
- API liefert deterministische Fallback-Response (`classifyFallback`) → immer schema-konform und maschinenlesbar.  

**Operator Action**  
- Logs analysieren (LLM-Output).  
- Prompt-Template prüfen/vereinfachen.  
- Alternatives Modell (`OPENAI_MODEL`) einsetzen.

---

## 3) Authentication/Authorization Fehler (401/403)

**Symptom**  
CPI oder Postman erhalten HTTP 401 oder 403.  

**Systemverhalten**  
- Token wird geprüft.  
- Fehlende oder falsche Scopes → `403 insufficient_scope`.  
- Falscher Client → `unauthorized_client`.  

**Operator Action**  
- XSUAA Service Key prüfen (`XSUAA_CLIENT_ID`, `XSUAA_CLIENT_SECRET`).  
- Scope `<XSAPPNAME>.flowsense.execute` muss im Token enthalten sein.  
- CPI OAuth-Konfiguration validieren.  
- Falls Allowlist aktiv: Client-ID gegen `ALLOWED_CLIENT_IDS` prüfen.  

---

## 4) Rate Limiting / Quota (429)

**Symptom**  
Antwort enthält HTTP 429 (FlowSense API oder OpenAI).  

**Systemverhalten**  
- FlowSense API: hartcodiertes Rate Limit von **120 Requests pro 60 Sekunden pro Route**.  
- OpenAI: Quota-Überschreitung möglich.  

**Operator Action**  
- Retry-Backoff implementieren.  
- OpenAI-Quota kontrollieren.  
- Hinweis: Anpassung des Limits in FlowSense erfordert Code-Änderung (`server.mjs`), nicht per ENV konfigurierbar.  

---

## 5) Circuit Breaker offen

**Symptom**  
`/analyze-error` liefert sofort Fallback mit `"reason": "circuit_open"`.  

**Systemverhalten**  
- CB nach `CB_THRESHOLD` Fehlern geöffnet.  
- Cooldown-Phase (`CB_COOLDOWN_MS`) aktiv.  
- Alle Calls → sofortiger Fallback.  

**Operator Action**  
- Ursache der Fehlerkette analysieren (Logs, Downstream-System).  
- Nach Cooldown testweise erneut aufrufen.  
- CB-Parameter (`CB_THRESHOLD`, `CB_COOLDOWN_MS`) anpassen (nur falls sinnvoll).  
- Optional: Status prüfen via `/cb-state` (nur sichtbar, wenn `EXPOSE_DEBUG_ENDPOINTS=true`).  

---

## 6) Weiterführende Dokumentation

- **Resilience & Betrieb** → siehe [`operations.md`](./operations.md) 
- **Security & Auth** → siehe [`./security.md`](./security.md)`.  
