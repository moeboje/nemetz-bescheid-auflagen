# Nemetz Web (Prototype)

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

## Runtime Config (ohne Rebuild)

- Datei: `apps/web/public/config.json`
- Vorlage: `apps/web/public/config.example.json`
- Loader: `src/config/runtimeConfig.ts` (`fetch("/config.json", { cache: "no-store" })`)
- AI bleibt standardmaessig deaktiviert (`enableAiAnalysis: false`).

## Daten & Persistenz

- Persistenz: `localStorage` mit versionierter Envelope (`src/state/persistence.ts`)
- Storage Version: `STORAGE_VERSION` in `src/state/persistence.ts`
- Relevante Keys:
  - `scopes`, `authorities`, `projects`, `legalDocs`, `obligations`, `deadlines`
  - `taskState`, `auditLog`, `users`, `currentUserId`, `notifications`, `notificationsLastTickAt`
- Export/Import:
  - Admin -> Datenverwaltung -> `Export JSON` / `Import JSON`
  - Import wird vor dem Bestätigen validiert (Errors/Warnings).

## Safe Mode & Recovery

- Safe Mode URL: `?safe=1` (z. B. `/compliance/dashboard?safe=1`)
- Verhalten:
  - Kein Laden aus `localStorage`
  - Demo-Seeds statt persistierter Daten
  - Banner mit `Safe Mode verlassen`
- Runtime Error Recovery:
  - `Neu laden`
  - `Daten exportieren`
  - `Auf Demo-Daten zuruecksetzen`
  - `Safe Mode starten`

## Rollen-Demo

- Benutzerwechsel oben rechts (wenn `enableRbacDemo: true`)
- Rollen/Permissions kommen aus `src/state/UsersStore.tsx` und `src/state/AuthorizationStore.tsx`.

## Known Limitations

- Kein echtes Backend
- Kein echter Datei-Upload (nur Stub/Metadaten)
- Keine produktive AI-Integration im Browser
  - Nur Placeholder-Contract via Runtime Config (`provider`, `proxyBaseUrl`)

## Doku

- `docs/DATA_CONTRACT.md`
- `docs/FUTURE_LARAVEL_REWRITE.md`
- `docs/AI_FUTURE_AZURE.md`

## Optional Docker

```bash
cd apps/web
docker compose up --build
```

- App ist danach auf `http://localhost:8080` erreichbar.
- Runtime Config kann per Volume gemountet werden:
  - `./public/config.json:/usr/share/nginx/html/config.json:ro`

## Auth + API (lokal)

```bash
cd apps/api
cp .env.example .env
npm install
npm run migrate:dev -- --name init_auth
npm run seed
npm run dev
```

Danach im zweiten Terminal:

```bash
cd apps/web
npm install
npm run dev
```

### Auth Routen

- `/login`
- `/mfa`
- `/forgot-password`
- `/reset-password`
- `/settings/security`
- `/admin/users` (nur Admin)

### Optional Microsoft Login (Entra ID)

- Login page shows `Mit Microsoft anmelden` only when API reports `/auth/entra/status` as enabled.
- Button target: `/api/auth/entra/start`
