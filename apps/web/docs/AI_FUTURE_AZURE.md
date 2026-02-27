# AI_FUTURE_AZURE

## Status im Prototype

- Keine direkten Azure-Calls aus dem Browser.
- Keine Secrets/Keys im Frontend.
- Runtime Config enthaelt nur:
  - `features.enableAiAnalysis`
  - `ai.provider` (`azure` | `mock` | `disabled`)
  - `ai.proxyBaseUrl` (spaeterer Backend-Proxy)

## Geplanter Integrationspfad

1. Frontend sendet Analyse-Request an Backend-Proxy (`/api/ai/...`).
2. Backend verwaltet Azure-Zugriff, Auth und Prompting.
3. Backend liefert normalisierte Ergebnisse (Feldvorschlaege, Auflagenvorschlaege, Confidence, Warnings).
4. Frontend uebernimmt nur Darstellung, Auswahl und Benutzer-Confirm.

## Sicherheitsprinzipien

- Keine API Keys in `config.json` oder Bundles.
- Keine direkte Browser-zu-Azure Verbindung.
- Alle Provider-spezifischen Details bleiben im Backend.

## Offene Punkte fuer spaeter

- Prompt-/Model-Versionierung
- Request- und Response-Audit
- Kosten-/Rate-Limit Monitoring
- Rollen-/Berechtigungspruefung fuer AI-Aktionen
