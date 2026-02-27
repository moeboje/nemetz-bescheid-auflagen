# Nemetz – Bescheid- & Auflagenmanagement

Standalone Modul (spaeter integrierbar ins Serviceportal).

## Lokaler Start

Frontend:

```bash
cd apps/web
npm install
npm run dev
```

API:

```bash
cd apps/api
cp .env.example .env
npm install
npm run migrate:dev -- --name init_auth
npm run seed
npm run dev
```

## Docker Compose (same-origin via Nginx)

```bash
cp .env.example .env
docker compose up --build
```

Danach ist das Portal auf `http://localhost:8080` erreichbar.

- Web: `/`
- API: `/api/*`
- Login: `/login`
- Admin Users: `/admin/users`
