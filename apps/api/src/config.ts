export type AppConfig = {
  port: number;
  databaseUrl: string;
  appOrigin: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadProjectEnvFile();

  const nodeEnv = env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development";

  const config: AppConfig = {
    port: toInteger(env.PORT, 4000),
    databaseUrl: env.DATABASE_URL?.trim() || "file:./dev.db",
    appOrigin: env.APP_ORIGIN?.trim() || "http://localhost:5173",
    sessionSecret: env.SESSION_SECRET?.trim() || "dev-only-change-me",
    nodeEnv,
    resetTokenTtlMinutes: toInteger(env.RESET_TOKEN_TTL_MINUTES, 30),
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
