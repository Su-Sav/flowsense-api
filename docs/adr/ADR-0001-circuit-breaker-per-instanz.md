# ADR-0001: Circuit Breaker pro Instanz (prozess-lokal)
 
- **Kontext:** FlowSense API (Node.js/Express) auf SAP BTP Cloud Foundry; LLM-Aufruf (OpenAI Responses API) kann zeitweise fehlschlagen/latenten Fehler erzeugen.  
- **Ziel:** Resilienz erhöhen und Fehlerspitzen abfedern, ohne unnötige Komplexität.

## Entscheidung
Der Circuit Breaker (CB) wird **pro Instanz** (prozess-lokal) implementiert. Der Zustand (`fails`, `openUntil`) liegt im **laufenden Node-Prozess**.  
Konfiguration via Env-Variablen:
- `CB_THRESHOLD` (Default 3)  
- `CB_COOLDOWN_MS` (Default 60000)

## Begründung (Entscheidungstreiber)
- **Einfachheit & Transparenz:** Keine externe Abhängigkeit (Redis/DB), leicht zu verstehen und zu betreiben.  
- **Passend zum Deployment-Modell:** Eine (oder wenige) CF-Instanz(en) ohne Worker/Cluster → pro-Instanz-CB genügt.  
- **Zeitnahe Wertschöpfung:** Minimaler Implementierungs- und Betriebsaufwand; sofortiger Schutz vor Flatterfehlern.  
- **Upgrade-Pfad vorhanden:** Bei künftigem **horizontalem Scaling** kann auf einen **verteilten CB** (z. B. Redis) migriert werden.

## Konsequenzen
- **Pros**
  - Keine Latenz/Single-Point-of-Failure durch externen Store  
  - Geringe Betriebskomplexität, klare Diagnose (Dev-/Logs)  
- **Cons**
  - **Kein geteilter Zustand zwischen Instanzen**: Jede Instanz „lernt“ separat.  
  - **Kein Thread-/Worker-Sharing**: Bei Einsatz von `cluster`/`worker_threads` müsste nachgezogen werden.

## Alternativen (bewertet)
1. **Verteilter CB (Redis/DB):** Shared State über Instanzen/Worker hinweg.  
   - + Einheitliches Verhalten im Cluster  
   - − Mehr Moving Parts, höhere Latenz/Komplexität, Betriebspflege  
2. **Library-basierter CB (z. B. opossum):** Komfortfunktionen (half-open, metrics).  
   - + Ausgereifter Funktionsumfang  
   - − Zusätzliche Abhängigkeit, nicht zwingend nötig im MVP

## Migrationspfad 
- Zustandsverwaltung in **Redis** abbilden (Keys pro Zielsystem/Operation), atomische Inkremente/TTL.  
- Optional: „half-open“-Phase und Jitter einführen.  
- Feature-Flag für schrittweise Aktivierung.

## Verweise
- README „Architektur“ → Hinweis „CB pro Instanz, upgradefähig“  
- `EXPOSE_DEBUG_ENDPOINTS` (siehe ADR-0002) für Dev-Only-State-Insight
