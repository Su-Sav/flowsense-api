# ADR-0002: Debug-/State-Endpunkte nur via Feature-Flag
 
- **Kontext:** Interner Zustand (z. B. Circuit Breaker) ist für **Diagnose** hilfreich, soll aber **nicht** in Produktion exponiert werden.  
- **Ziel:** Debugbarkeit in Dev/Stage ermöglichen, **ohne** Sicherheits-/Informationsrisiko in Prod.

## Entscheidung
Debug-/State-Endpunkte werden **nicht standardmäßig** bereitgestellt.  
Sie werden **ausschließlich** aktiviert, wenn das **Feature-Flag** gesetzt ist:
- `EXPOSE_DEBUG_ENDPOINTS=true`

Beispiel:  
- `/cb-state` wird **nur** registriert, wenn das Flag aktiv ist.  
- In Produktion ist das Flag **nicht gesetzt** → Endpoint existiert nicht (404).

## Begründung (Entscheidungstreiber)
- **Security by Default:** Kein „Information Disclosure“ in Prod.  
- **Explizite Steuerung:** Unabhängig von `NODE_ENV`; klare, dokumentierte Opt-in-Entscheidung.  
- **Professionelle Kommunikation:** Reviewer erkennen im `.env.example`, dass Debug bewusst per Toggle erfolgt.

## Konsequenzen
- **Pros**
  - Minimiert Angriffsfläche/Informationsabfluss  
  - Klare Trennung Dev/Prod, leicht auditierbar  
- **Cons**
  - Für Ad-hoc-Analysen in Prod muss bewusst (temporär) aktiviert oder über andere Mechanismen (Logs, APM) gearbeitet werden.

## Alternativen (bewertet)
1. **Auth-/Scope-Absicherung (XSUAA) für Debug-Endpunkte:**  
   - + Fein granular, bleibt erreichbar  
   - − Debug wird in Prod oft nicht benötigt; zusätzlicher Codepfad/Policy-Pflege  
2. **API-Management-Only Access:**  
   - + Steuerbar über Gateway/Keys  
   - − Höhere Betriebs-/Konfig-Komplexität, Debug bleibt grundsätzlich exponiert

## Betriebsrichtlinie
- **Default:** `EXPOSE_DEBUG_ENDPOINTS=false` (Prod/Stage)  
- **Dev/Diagnose:** nur bewusst und temporär auf `true` setzen  
- Dokumentation im README und in `docs/security.md`.

## Verweise
- README Abschnitt „Architektur/Security“  
- `.env.example` mit `EXPOSE_DEBUG_ENDPOINTS=false` (Default)  
- ADR-0001 (CB pro Instanz) – `/cb-state` visualisiert genau diesen Zustand, aber **nur** in Dev
