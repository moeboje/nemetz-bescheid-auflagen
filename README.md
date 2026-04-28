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

## Docker Compose (local HTTP dev stack via Nginx)

```bash
cp .env.example .env
# Set explicit non-default ADMIN_EMAIL and ADMIN_PASSWORD in .env before starting the stack.
docker compose up --build
```

Danach ist das Portal auf `http://localhost:8080` erreichbar.

Dieser Compose-Stack ist bewusst die lokale HTTP-Entwicklungsumgebung ohne TLS. Deshalb laeuft er mit `NODE_ENV=development` und `COOKIE_SECURE=false`, damit der Login auf `http://localhost:8080` funktioniert.

Produktion bleibt davon getrennt: dort sind `NODE_ENV=production`, ein starkes `SESSION_SECRET`, HTTPS und `COOKIE_SECURE=true` zwingend.

- Web: `/`
- API: `/api/*`
- Login: `/login`
- Admin Users: `/admin/users`
