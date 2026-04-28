# Nemetz API (Auth + Users)

## Setup (Development)

```bash
cd apps/api
cp .env.example .env
npm install
# Set explicit non-default ADMIN_EMAIL and ADMIN_PASSWORD in .env before running the seed.
npm run migrate:dev -- --name init_auth
npm run seed
npm run dev
```

For this auth upgrade, run migration + seed after pulling changes:

```bash
cd apps/api
npm install
# Ensure ADMIN_EMAIL and ADMIN_PASSWORD are set to explicit non-default values in .env.
npm run migrate:dev -- --name mfa_totp_support
npm run seed
```

API base path: `http://localhost:4000/api`

## Seeded Admin

- No default admin credentials are created anymore.
- Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` explicitly before bootstrap or `npm run seed`.
- `SEED_DEFAULT_PASSWORD` is optional and defaults to the explicit admin password when omitted.

## E-Mail Notifications

Serverseitige Benachrichtigungen werden in PostgreSQL ueber `NotificationOutbox` gespeichert.

Wichtige Env-Variablen:

- `NOTIFICATION_BASE_URL`
- `NOTIFICATION_DISPATCH_ENABLED`
- `NOTIFICATION_DRY_RUN`
- `POWER_AUTOMATE_NOTIFICATION_WEBHOOK_URL`
- `POWER_AUTOMATE_NOTIFICATION_SECRET`
- `PASSWORD_RESET_TOKEN_TTL_MINUTES`

Dispatcher lokal ausfuehren:

```bash
cd apps/api
npx prisma generate
npm run build
npm run notifications:dispatch
```

Dispatcher als periodischen Worker lokal ausfuehren:

```bash
cd apps/api
npx prisma generate
npm run build
npm run notifications:worker
```

Hinweise:

- Passwort-Reset-Tokens werden nur gehasht gespeichert.
- Alte Reset-Links bleiben aktiv, bis ein neu erzeugter Reset-Link erfolgreich zugestellt wurde.
- Reset-Links werden aus Sicherheitsgruenden nicht fuer asynchrone Retries persistiert; fehlgeschlagene Reset-Mails muessen neu ausgeloest werden.
- `NOTIFICATION_DRY_RUN=true` markiert Benachrichtigungen als gesendet, ohne einen Power-Automate-Webhook aufzurufen.

## Migrations

```bash
npm run migrate:dev -- --name <name>
npm run migrate:deploy
```

## Tests

```bash
npm test
```

## MFA (TOTP)

- Setup endpoint: `POST /api/auth/mfa/totp/setup`
- Confirm endpoint: `POST /api/auth/mfa/totp/confirm`
- Verify endpoint during login challenge: `POST /api/auth/mfa/verify`
- Disable endpoint: `POST /api/auth/mfa/totp/disable`
- Status endpoint: `GET /api/auth/mfa/status`

Recovery codes are returned once during confirm and only hashed values are stored.

## Entra ID (OIDC)

Optional env flags (see `.env.example`):

- `AUTH_ENABLE_ENTRA`
- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET`
- `ENTRA_REDIRECT_URI`
- `ENTRA_ALLOWED_DOMAINS`
- `ENTRA_AUTO_PROVISION`
- `ENTRA_SCOPES`

Routes:

- `GET /api/auth/entra/status`
- `GET /api/auth/entra/start`
- `GET /api/auth/entra/callback`

## Manual Checklist

1. Login with password only still works for a user without MFA.
2. User opens security settings, starts TOTP setup, confirms with authenticator code, and stores recovery codes.
3. Next login returns `mfaRequired`, `/auth/mfa/verify` succeeds with TOTP code.
4. Recovery code login works once; same code fails on second use.
5. Admin can enforce MFA for a user and user login returns `mfaRequired`.
6. Admin can reset MFA (enabled/enforced cleared).
7. If Entra is enabled, login page shows Microsoft button and callback creates a valid local session.
