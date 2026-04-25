# Nemetz Web

React-Frontend fuer das Portal. Die fachlich migrierten Domänen lesen und schreiben serverseitig ueber die API; PostgreSQL ist dort die massgebliche Source of Truth.

## Start (Frontend)

```bash
cd apps/web
npm install
npm run dev
```

## Build (Frontend)

```bash
cd apps/web
npm run build
```

## Lokaler Gesamtstart

API zuerst:

```bash
cd apps/api
cp .env.example .env
npm install
npx prisma generate
npx prisma db push --skip-generate
npm run dev
```

Danach im zweiten Terminal:

```bash
cd apps/web
npm install
npm run dev
```

## Runtime Config (ohne Rebuild)

- Datei: `apps/web/public/config.json`
- Vorlage: `apps/web/public/config.example.json`
- Loader: `src/config/runtimeConfig.tsx`
- AI bleibt standardmaessig deaktiviert.

## Persistenzmodell

- Serverseitig ueber API + PostgreSQL persistiert:
  - Scopes (`companies`, `sites`, `facilities`)
  - Authorities und Authority Contacts
  - Projects
  - Project Checklists
  - Legal Documents
  - Obligations
  - Deadlines
  - TaskState
  - Auth, Sessions, MFA, Admin Users, Roles, External Organizations, globale Security Settings und serverseitige Mail-Notifications
- Browser-Storage bleibt nur fuer lokale UI-/Recovery-Artefakte und Legacy-Aufraeumlogik relevant.
- `localStorage` ist fuer die migrierten Fachdomänen keine Source of Truth mehr.

## Export / Recovery / Safe Mode

- Admin -> Datenverwaltung -> `Teil-Export JSON`
- Der JSON-Export ist ein Teil-Export, kein vollstaendiges Disaster-Recovery-Backup.
- Nicht enthalten im generischen Export:
  - Benutzer
  - Rollen
  - Externe Firmen
  - globale Security Settings
  - Notification Settings / Notification Outbox
- Datei-Inhalte aus lokaler Evidence-/Dokumentenablage werden nicht vollstaendig mit exportiert.
- Gesamt-Import, Gesamt-Reset und Demo-Replace sind aktuell gesperrt, bis ein serverseitig orchestrierter atomarer Recovery-Pfad existiert.
- Safe Mode URL: `?safe=1`
- ErrorBoundary-Reset setzt nur lokale Browserdaten zur Fehlerisolierung zurueck; serverseitige Fachdaten bleiben unveraendert.

## Fachliche Highlights im aktuellen Modell

- Projekte fuehren `status` und `submissionType` getrennt.
- Projekt-Checklisten sind eigene serverseitige Projekt-Subressourcen.
- Browser-lokale In-App-Notifications bleiben getrennt von serverseitigen E-Mail-Notifications ueber `NotificationOutbox`.

## Auth Routen

- `/login`
- `/mfa`
- `/forgot-password`
- `/reset-password`
- `/compliance/account`
- `/compliance/account/security`
- `/admin/users`

## Optional Microsoft Login (Entra ID)

- Die Login-Seite zeigt `Mit Microsoft anmelden` nur, wenn die API `/auth/entra/status` als aktiv meldet.
- Button-Ziel: `/api/auth/entra/start`

## Doku

- `apps/web/docs/DATA_CONTRACT.md`
- `docs/exec-plan-domain-persistence.md`
- `docs/exec-plan-project-status-and-submission-checklists.md`
- `docs/exec-plan-admin-users-roles-security.md`

## Optional Docker

```bash
docker compose up --build
```

Danach ist das Portal auf `http://localhost:8080` erreichbar.
