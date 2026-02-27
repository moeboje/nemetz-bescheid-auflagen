# FUTURE_LARAVEL_REWRITE

## Zielbild

- Frontend wird zu API-Client
- Persistenz wandert von `localStorage` auf relationale Tabellen
- Audit, Notifications, Reporting und Integritaetspruefungen laufen serverseitig

## Vorschlag Tabellen-Mapping

- `companies`, `sites`, `facilities`
- `authorities`, `authority_contacts`
- `users`, `user_roles`
- `projects`, `project_internal_participants`, `project_external_participants`, `project_attachments`
- `legal_docs`, `legal_doc_attachments`, `legal_doc_ai_runs`
- `obligations`
- `deadlines`
- `task_instances`, `task_state_events`
- `evidence`, `evidence_attachments`
- `notifications`
- `audit_log`

## API Contract Ideen (minimal)

- `GET /api/bootstrap`
  - liefert Stammdaten + Runtime Features
- CRUD Endpoints pro Entity
  - `GET/POST/PATCH /api/projects`
  - analog fuer `legal-docs`, `obligations`, `deadlines`, `authorities`, `scopes`
- Integritaet
  - `GET /api/diagnostics/integrity`
  - `POST /api/diagnostics/fixes`
- Notifications
  - `POST /api/notifications/tick`
  - `GET /api/notifications`
- Reporting
  - `GET /api/reports/compliance`
  - `GET /api/reports/compliance.csv`

## Migrationshinweise

- IDs im Prototype sind String-IDs; fuer Rewrite koennen UUIDs genutzt werden.
- Archive-Pattern (`isArchived` + `archivedAt`) sollte erhalten bleiben.
- Export-Payload kann als Seed-/Importformat fuer Data-Migration genutzt werden.
