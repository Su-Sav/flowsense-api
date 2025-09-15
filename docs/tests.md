
# FlowSense API – Testfälle (curl)

> Voraussetzungen  
> - Server läuft lokal: `npm run dev` (Auth aus)  
> - `.env`: `OPENAI_API_KEY` gesetzt  
> - Optional: `/cb-state` nur bei `EXPOSE_DEBUG_ENDPOINTS=true` sichtbar  
> - Für formatierten Output: `jq` installiert

---

## 1) Authentication Error — 401

**Request**
```bash
curl -s http://localhost:3000/analyze-error \
  -H "Content-Type: application/json" \
  -d '{
    "flow":"DemoFlow",
    "stepName":"RequestReply_Test",
    "targetSystem":"DemoSystem",
    "httpStatus":"401",
    "errorMessage":"Unauthorized: invalid bearer token",
    "attempts":1
  }' | jq .
````

**Erwartete Eigenschaften**

* `type = "authentication"`
* `retry_hint.allowed = false`
* `requires_manual = true`

**Beispiel-Response**

```json
{
  "flow": "DemoFlow",
  "type": "authentication",
  "description": "The request to the target system failed due to an invalid bearer token.",
  "root_causes": [
    "Bearer token expired or incorrect.",
    "Token not sent in the correct authorization header.",
    "Issues with the authentication configuration in the CPI system."
  ],
  "suggested_fix": [
    "Verify the bearer token for correctness.",
    "Ensure that the token is not expired.",
    "Check the configuration settings for the authentication in the CPI integration flow."
  ],
  "retry_hint": { "allowed": false, "after_seconds": 0, "max_attempts": 0 },
  "requires_manual": true,
  "signals": { "http_status": "401", "target_system": "DemoSystem", "step": "RequestReply_Test" }
}
```

---

## 2) Connectivity Error — 500 (Fallback/Timeout)

**Request**

```bash
curl -s http://localhost:3000/analyze-error \
  -H "Content-Type: application/json" \
  -d '{
    "flow":"PaymentFlow",
    "stepName":"ODataCall",
    "targetSystem":"ERPSystem",
    "httpStatus":"500",
    "errorMessage":"Internal Server Error",
    "attempts":2
  }' | jq .
```

**Erwartete Eigenschaften**

* `type = "connectivity"`
* `retry_hint.allowed = true` (mit Wartezeit & Max-Versuchen)
* `requires_manual = false`

**Beispiel-Response**

```json
{
  "flow": "PaymentFlow",
  "type": "connectivity",
  "description": "Rule-based decision (AI_TIMEOUT) for status 500",
  "root_causes": ["AI_TIMEOUT", "http_status=500", "step=ODataCall"],
  "suggested_fix": ["Retry with exponential backoff", "Check downstream health & credentials"],
  "retry_hint": { "allowed": true, "after_seconds": 60, "max_attempts": 6 },
  "requires_manual": false,
  "signals": { "http_status": "500", "target_system": "ERPSystem", "step": "ODataCall" }
}
```

---

## 3) Payload/Business Error — 400

**Request**

```bash
curl -s http://localhost:3000/analyze-error \
  -H "Content-Type: application/json" \
  -d '{
    "flow":"OrderFlow",
    "stepName":"MappingStep",
    "targetSystem":"OrderService",
    "httpStatus":"400",
    "errorMessage":"Customer ID missing",
    "attempts":1
  }' | jq .
```

**Erwartete Eigenschaften**

* `type = "payload_mapping"` (oder je nach Prompt „business“)
* `retry_hint.allowed = false`
* `requires_manual = true`

**Beispiel-Response**

```json
{
  "flow": "OrderFlow",
  "type": "payload_mapping",
  "description": "The mapping step in the OrderFlow has encountered an error due to a missing Customer ID in the payload. This causes the integration to fail as the target system requires this information for processing.",
  "root_causes": [
    "Customer ID is not provided in the incoming payload.",
    "Mapping logic does not account for an empty Customer ID."
  ],
  "suggested_fix": [
    "Check the source system to ensure that the Customer ID is included in the payload.",
    "Update the mapping logic to handle cases where Customer ID may be missing."
  ],
  "retry_hint": { "allowed": false, "after_seconds": 0, "max_attempts": 1 },
  "requires_manual": true,
  "signals": { "http_status": "400", "target_system": "OrderService", "step": "MappingStep" }
}
```

---

## Circuit Breaker State (nur Dev)

> Nur verfügbar, wenn `EXPOSE_DEBUG_ENDPOINTS=true` gesetzt ist.

```bash
curl -s http://localhost:3000/cb-state | jq .
```
