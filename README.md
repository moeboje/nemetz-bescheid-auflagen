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
# Set explicit non-default ADMIN_EMAIL and ADMIN_PASSWORD in apps/api/.env before seeding.
npm run migrate:dev -- --name init_auth
npm run seed
npm run dev
```

## Docker Compose (same-origin via Nginx)

```bash
cp .env.example .env
# Set explicit non-default ADMIN_EMAIL and ADMIN_PASSWORD in .env before starting the stack.
docker compose up --build
```

Danach ist das Portal auf `http://localhost:8080` erreichbar.

- Web: `/`
- API: `/api/*`
- Login: `/login`
- Admin Users: `/admin/users`
