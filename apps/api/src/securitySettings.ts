import { Prisma, type PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const SECURITY_SETTINGS_ID = "global";
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_SESSION_TTL_DAYS = 1;
export const MAX_SESSION_TTL_DAYS = 30;
export const MIN_LOCKOUT_MINUTES = 1;
export const MAX_LOCKOUT_MINUTES = 240;
export const MIN_FAILED_LOGIN_ATTEMPTS = 3;
export const MAX_FAILED_LOGIN_ATTEMPTS = 20;

export type EffectiveSecuritySettings = {
  passwordMinLength: number;
  passwordRequireNumberOrSpecial: boolean;
  maxFailedLoginAttempts: number;
  lockoutMinutes: number;
  sessionTtlDays: number;
  allowExternalUsers: boolean;
};

export function getDefaultSecuritySettings(config: AppConfig): EffectiveSecuritySettings {
  return {
    passwordMinLength: MIN_PASSWORD_LENGTH,
    passwordRequireNumberOrSpecial: true,
    maxFailedLoginAttempts: 5,
    lockoutMinutes: 15,
    sessionTtlDays: config.sessionTtlDays,
    allowExternalUsers: true
  };
}

export function sanitizeSecuritySettingsInput(
  input: Partial<EffectiveSecuritySettings>,
  current: EffectiveSecuritySettings
) {
  return {
    passwordMinLength:
      typeof input.passwordMinLength === "number"
        ? Math.min(Math.max(Math.trunc(input.passwordMinLength), MIN_PASSWORD_LENGTH), MAX_PASSWORD_LENGTH)
        : current.passwordMinLength,
    passwordRequireNumberOrSpecial:
      typeof input.passwordRequireNumberOrSpecial === "boolean"
        ? input.passwordRequireNumberOrSpecial
        : current.passwordRequireNumberOrSpecial,
    maxFailedLoginAttempts:
      typeof input.maxFailedLoginAttempts === "number"
        ? Math.min(
            Math.max(Math.trunc(input.maxFailedLoginAttempts), MIN_FAILED_LOGIN_ATTEMPTS),
            MAX_FAILED_LOGIN_ATTEMPTS
          )
        : current.maxFailedLoginAttempts,
    lockoutMinutes:
      typeof input.lockoutMinutes === "number"
        ? Math.min(Math.max(Math.trunc(input.lockoutMinutes), MIN_LOCKOUT_MINUTES), MAX_LOCKOUT_MINUTES)
        : current.lockoutMinutes,
    sessionTtlDays:
      typeof input.sessionTtlDays === "number"
        ? Math.min(Math.max(Math.trunc(input.sessionTtlDays), MIN_SESSION_TTL_DAYS), MAX_SESSION_TTL_DAYS)
        : current.sessionTtlDays,
    allowExternalUsers:
      typeof input.allowExternalUsers === "boolean" ? input.allowExternalUsers : current.allowExternalUsers
  } satisfies EffectiveSecuritySettings;
}

export async function getEffectiveSecuritySettings(prisma: PrismaClient, config: AppConfig) {
  const defaults = getDefaultSecuritySettings(config);
  const rows = await prisma.$queryRaw<
    Array<
      EffectiveSecuritySettings & {
        id: string;
      }
    >
  >(Prisma.sql`
    SELECT
      "id",
      "passwordMinLength",
      "passwordRequireNumberOrSpecial",
      "maxFailedLoginAttempts",
      "lockoutMinutes",
      "sessionTtlDays",
      "allowExternalUsers"
    FROM "SecuritySettings"
    WHERE "id" = ${SECURITY_SETTINGS_ID}
    LIMIT 1
  `);
  const row = rows[0];

  if (!row) {
    return defaults;
  }

  return sanitizeSecuritySettingsInput(
    {
      passwordMinLength: row.passwordMinLength,
      passwordRequireNumberOrSpecial: row.passwordRequireNumberOrSpecial,
      maxFailedLoginAttempts: row.maxFailedLoginAttempts,
      lockoutMinutes: row.lockoutMinutes,
      sessionTtlDays: row.sessionTtlDays,
      allowExternalUsers: row.allowExternalUsers
    },
    defaults
  );
}

export async function getAllowExternalUsers(prisma: DbClient) {
  const rows = await prisma.$queryRaw<Array<{ allowExternalUsers: boolean }>>(Prisma.sql`
    SELECT "allowExternalUsers"
    FROM "SecuritySettings"
    WHERE "id" = ${SECURITY_SETTINGS_ID}
    LIMIT 1
  `);

  return rows[0]?.allowExternalUsers ?? true;
}

export async function ensureSecuritySettings(prisma: PrismaClient, config: AppConfig) {
  const defaults = getDefaultSecuritySettings(config);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "SecuritySettings" (
      "id",
      "passwordMinLength",
      "passwordRequireNumberOrSpecial",
      "maxFailedLoginAttempts",
      "lockoutMinutes",
      "sessionTtlDays",
      "allowExternalUsers",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${SECURITY_SETTINGS_ID},
      ${defaults.passwordMinLength},
      ${defaults.passwordRequireNumberOrSpecial},
      ${defaults.maxFailedLoginAttempts},
      ${defaults.lockoutMinutes},
      ${defaults.sessionTtlDays},
      ${defaults.allowExternalUsers},
      NOW(),
      NOW()
    )
    ON CONFLICT ("id") DO NOTHING
  `);
}

export async function saveSecuritySettings(prisma: PrismaClient, settings: EffectiveSecuritySettings) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "SecuritySettings" (
      "id",
      "passwordMinLength",
      "passwordRequireNumberOrSpecial",
      "maxFailedLoginAttempts",
      "lockoutMinutes",
      "sessionTtlDays",
      "allowExternalUsers",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${SECURITY_SETTINGS_ID},
      ${settings.passwordMinLength},
      ${settings.passwordRequireNumberOrSpecial},
      ${settings.maxFailedLoginAttempts},
      ${settings.lockoutMinutes},
      ${settings.sessionTtlDays},
      ${settings.allowExternalUsers},
      NOW(),
      NOW()
    )
    ON CONFLICT ("id") DO UPDATE
    SET
      "passwordMinLength" = EXCLUDED."passwordMinLength",
      "passwordRequireNumberOrSpecial" = EXCLUDED."passwordRequireNumberOrSpecial",
      "maxFailedLoginAttempts" = EXCLUDED."maxFailedLoginAttempts",
      "lockoutMinutes" = EXCLUDED."lockoutMinutes",
      "sessionTtlDays" = EXCLUDED."sessionTtlDays",
      "allowExternalUsers" = EXCLUDED."allowExternalUsers",
      "updatedAt" = NOW()
  `);
}
