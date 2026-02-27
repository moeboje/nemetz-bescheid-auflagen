# Nemetz API (Auth + Users)

## Setup (Development)

```bash
cd apps/api
cp .env.example .env
npm install
npm run migrate:dev -- --name init_auth
npm run seed
npm run dev
```

For this auth upgrade, run migration + seed after pulling changes:

```bash
cd apps/api
npm install
npm run migrate:dev -- --name mfa_totp_support
npm run seed
```

API base path: `http://localhost:4000/api`

## Seeded Admin

- Default email: `admin@example.com`
- Password comes from `ADMIN_PASSWORD` (or fallback from `.env.example`)
- Change the admin password after first login.

## Mail Outbox (dev)

Password reset requests are written to:

- `apps/api/storage/mail-outbox/*.json`

Each file contains:

- `toEmail`
- `resetLink`
- `expiresAt`

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
