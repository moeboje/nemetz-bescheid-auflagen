export type AppConfig = {
  port: number;
  databaseUrl: string;
  appOrigin: string;
  notificationBaseUrl: string;
  notificationDispatchEnabled: boolean;
  notificationDryRun: boolean;
  notificationFromLabel: string;
  powerAutomateNotificationWebhookUrl: string;
  powerAutomateNotificationSecret: string;
  notificationMaxAttempts: number;
  notificationDispatchBatchSize: number;
  notificationDispatchTimeoutMs: number;
  notificationClaimLeaseSeconds: number;
  notificationTimeZone: string;
  sessionSecret: string;
  nodeEnv: "development" | "production" | "test";
  resetTokenTtlMinutes: number;
  sessionTtlDays: number;
  cookieSecure: boolean;
  basePath: string;
  authEnableEntra: boolean;
  entraTenantId: string;
  entraClientId: string;
  entraClientSecret: string;
  entraRedirectUri: string;
  entraAllowedDomains: string[];
  entraAutoProvision: boolean;
  entraScopes: string[];
  documentsStorageDir: string;
  documentsMaxUploadBytes: number;
};

export const DEFAULT_DATABASE_URL = "postgresql://portal:portalpw@localhost:5433/portaldev?schema=public";
export const DEFAULT_TEST_DATABASE_URL = "postgresql://portal:portalpw@localhost:5433/portaldev?schema=test";
const DEFAULT_TEST_SCHEMA = "test";

let hasLoadedEnvFile = false;

export function loadProjectEnvFile() {
  if (hasLoadedEnvFile) {
    return;
  }

  hasLoadedEnvFile = true;

  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

function toBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
}

function toInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toList(value: string | undefined, fallback: string[]) {
  if (!value || !value.trim()) {
    return fallback;
  }
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeBasePath(value: string | undefined) {
  if (!value || !value.trim()) {
    return "/api";
  }
  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function parsePostgresUrl(value: string, sourceName: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${sourceName} must be a valid PostgreSQL URL.`);
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`${sourceName} must use the PostgreSQL protocol.`);
  }

  return parsed;
}

function assertSafeTestDatabaseUrl(value: string, sourceName: string) {
  const parsed = parsePostgresUrl(value, sourceName);
  const schema = parsed.searchParams.get("schema")?.trim().toLowerCase();

  if (!schema || schema === "public") {
    throw new Error(
      `${sourceName} must point to a dedicated non-public PostgreSQL schema when NODE_ENV=test.`
    );
  }

  return value;
}

function deriveSafeTestDatabaseUrl(databaseUrl: string) {
  const parsed = parsePostgresUrl(databaseUrl, "DATABASE_URL");
  parsed.searchParams.set("schema", DEFAULT_TEST_SCHEMA);
  return parsed.toString();
}

export function resolveDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv: AppConfig["nodeEnv"] | string | undefined = env.NODE_ENV
) {
  if (nodeEnv === "test") {
    const explicitTestDatabaseUrl = env.TEST_DATABASE_URL?.trim();
    if (explicitTestDatabaseUrl) {
      return assertSafeTestDatabaseUrl(explicitTestDatabaseUrl, "TEST_DATABASE_URL");
    }

    const explicitDatabaseUrl = env.DATABASE_URL?.trim();
    if (explicitDatabaseUrl) {
      return deriveSafeTestDatabaseUrl(explicitDatabaseUrl);
    }

    return DEFAULT_TEST_DATABASE_URL;
  }

  const explicitDatabaseUrl = env.DATABASE_URL?.trim();
  if (explicitDatabaseUrl) {
    return explicitDatabaseUrl;
  }

  return DEFAULT_DATABASE_URL;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadProjectEnvFile();

  const nodeEnv = env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development";

  const config: AppConfig = {
    port: toInteger(env.PORT, 4000),
    databaseUrl: resolveDatabaseUrl(env, nodeEnv),
    appOrigin: env.APP_ORIGIN?.trim() || "http://localhost:5173",
    notificationBaseUrl: env.NOTIFICATION_BASE_URL?.trim() || env.APP_ORIGIN?.trim() || "http://localhost:5173",
    notificationDispatchEnabled: toBoolean(env.NOTIFICATION_DISPATCH_ENABLED, false),
    notificationDryRun: toBoolean(env.NOTIFICATION_DRY_RUN, false),
    notificationFromLabel: env.NOTIFICATION_FROM_LABEL?.trim() || "Nemetz Portal",
    powerAutomateNotificationWebhookUrl: env.POWER_AUTOMATE_NOTIFICATION_WEBHOOK_URL?.trim() || "",
    powerAutomateNotificationSecret: env.POWER_AUTOMATE_NOTIFICATION_SECRET?.trim() || "",
    notificationMaxAttempts: toInteger(env.NOTIFICATION_MAX_ATTEMPTS, 5),
    notificationDispatchBatchSize: toInteger(env.NOTIFICATION_DISPATCH_BATCH_SIZE, 25),
    notificationDispatchTimeoutMs: toInteger(env.NOTIFICATION_DISPATCH_TIMEOUT_MS, 15_000),
    notificationClaimLeaseSeconds: toInteger(env.NOTIFICATION_CLAIM_LEASE_SECONDS, 300),
    notificationTimeZone: env.NOTIFICATION_TIMEZONE?.trim() || "Europe/Vienna",
    sessionSecret: env.SESSION_SECRET?.trim() || "dev-only-change-me",
    nodeEnv,
    resetTokenTtlMinutes: toInteger(
      env.PASSWORD_RESET_TOKEN_TTL_MINUTES?.trim() || env.RESET_TOKEN_TTL_MINUTES?.trim(),
      120
    ),
    sessionTtlDays: toInteger(env.SESSION_TTL_DAYS, 7),
    cookieSecure: toBoolean(env.COOKIE_SECURE, nodeEnv === "production"),
    basePath: normalizeBasePath(env.BASE_PATH),
    authEnableEntra: toBoolean(env.AUTH_ENABLE_ENTRA, false),
    entraTenantId: env.ENTRA_TENANT_ID?.trim() || "",
    entraClientId: env.ENTRA_CLIENT_ID?.trim() || "",
    entraClientSecret: env.ENTRA_CLIENT_SECRET?.trim() || "",
    entraRedirectUri: env.ENTRA_REDIRECT_URI?.trim() || "http://localhost:4000/api/auth/entra/callback",
    entraAllowedDomains: toList(env.ENTRA_ALLOWED_DOMAINS, ["nemetz-ag.at"]),
    entraAutoProvision: toBoolean(env.ENTRA_AUTO_PROVISION, false),
    entraScopes: toList(env.ENTRA_SCOPES, ["openid", "profile", "email"]),
    documentsStorageDir: env.DOCUMENTS_STORAGE_DIR?.trim() || "storage",
    documentsMaxUploadBytes: toInteger(env.DOCUMENTS_MAX_UPLOAD_MB, 20) * 1024 * 1024
  };

  return config;
}
