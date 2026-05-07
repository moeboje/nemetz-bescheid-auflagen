import { isIP } from "node:net";

export type AppConfig = {
  port: number;
  databaseUrl: string;
  appOrigin: string;
  notificationBaseUrl: string;
  legacyRecoveryEndpointsEnabled?: boolean;
  notificationDispatchEnabled: boolean;
  notificationDryRun: boolean;
  notificationFromLabel: string;
  powerAutomateNotificationWebhookUrl: string;
  powerAutomateNotificationSecret: string;
  notificationMaxAttempts: number;
  notificationDispatchBatchSize: number;
  notificationDispatchTimeoutMs: number;
  perfLoggingEnabled?: boolean;
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
  uploadDir?: string;
  documentsStorageDir: string;
  legacyDocumentsStorageDir?: string;
  documentsMaxUploadBytes: number;
};

export const DEFAULT_DATABASE_URL = "postgresql://portal:portalpw@localhost:5433/portaldev?schema=public";
export const DEFAULT_TEST_DATABASE_URL = "postgresql://portal:portalpw@localhost:5433/portaldev?schema=test";
const DEFAULT_TEST_SCHEMA = "test";
const DEFAULT_ENTRA_REDIRECT_URI = "http://localhost:4000/api/auth/entra/callback";
const DEV_SESSION_SECRET = "dev-only-change-me";
const MIN_PRODUCTION_SESSION_SECRET_LENGTH = 32;
const MIN_PRODUCTION_SESSION_SECRET_DISTINCT_CHARACTERS = 5;
const MIN_OBVIOUS_SEQUENCE_SEGMENT_LENGTH = 6;
const MAX_OBVIOUS_SEQUENCE_SEGMENTS = 3;
const MAX_OBVIOUS_SEQUENCE_SUFFIX_LENGTH = 6;
const MAX_NOTIFICATION_DISPATCH_TIMEOUT_MS = 15_000;
const INSECURE_SESSION_SECRET_VALUES = new Set([
  DEV_SESSION_SECRET,
  "replace-me-with-long-random-secret",
  "replace-with-a-long-random-secret"
].map((value) => value.toLowerCase()));
const OBVIOUS_SESSION_SECRET_SEQUENCES = [
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
  "0123456789abcdef"
];

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

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function parseAbsoluteUrl(value: string, sourceName: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${sourceName} must be a valid absolute URL.`);
  }

  return parsed;
}

function normalizeHostname(value: string) {
  const normalized = value.trim().toLowerCase();
  const withoutBrackets =
    normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
  if (withoutBrackets.endsWith(".")) {
    return withoutBrackets.slice(0, -1);
  }
  return withoutBrackets;
}

function parseIpv4Octets(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (
    octets.some(
      (octet, index) =>
        !/^\d+$/.test(parts[index] ?? "") || !Number.isInteger(octet) || octet < 0 || octet > 255
    )
  ) {
    return null;
  }

  return octets;
}

function isLoopbackIpv4Address(hostname: string) {
  const octets = parseIpv4Octets(hostname);
  return octets !== null && octets[0] === 127;
}

function parseIpv6SegmentPart(part: string) {
  if (!part) {
    return [];
  }

  const segments: number[] = [];
  for (const entry of part.split(":")) {
    if (!entry) {
      return null;
    }

    if (entry.includes(".")) {
      const octets = parseIpv4Octets(entry);
      if (!octets) {
        return null;
      }

      segments.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(entry)) {
      return null;
    }

    segments.push(Number.parseInt(entry, 16));
  }

  return segments;
}

function parseIpv6Segments(value: string) {
  const normalized = normalizeHostname(value);
  if (isIP(normalized) !== 6) {
    return null;
  }

  const parts = normalized.split("::");
  if (parts.length > 2) {
    return null;
  }

  const head = parseIpv6SegmentPart(parts[0] ?? "");
  const tail = parseIpv6SegmentPart(parts[1] ?? "");
  if (!head || !tail) {
    return null;
  }

  if (parts.length === 2) {
    const missingSegments = 8 - (head.length + tail.length);
    if (missingSegments < 1) {
      return null;
    }

    return [...head, ...Array<number>(missingSegments).fill(0), ...tail];
  }

  if (head.length !== 8) {
    return null;
  }

  return head;
}

function extractEmbeddedIpv4OctetsFromIpv6Segments(segments: number[]) {
  if (segments.length !== 8) {
    return null;
  }

  const isIpv4Compatible = segments.slice(0, 6).every((segment) => segment === 0);
  const isIpv4Mapped =
    segments.slice(0, 5).every((segment) => segment === 0) && segments[5] === 0xffff;
  if (!isIpv4Compatible && !isIpv4Mapped) {
    return null;
  }

  return [segments[6] >> 8, segments[6] & 0xff, segments[7] >> 8, segments[7] & 0xff];
}

function isLoopbackIpv6Address(hostname: string) {
  const segments = parseIpv6Segments(hostname);
  if (!segments) {
    return false;
  }

  if (segments.slice(0, 7).every((segment) => segment === 0) && segments[7] === 1) {
    return true;
  }

  const embeddedIpv4Octets = extractEmbeddedIpv4OctetsFromIpv6Segments(segments);
  return embeddedIpv4Octets !== null && embeddedIpv4Octets[0] === 127;
}

function isLoopbackHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  return isLoopbackIpv4Address(normalized) || isLoopbackIpv6Address(normalized);
}

function validateProductionPublicUrl(parsed: URL, sourceName: string) {
  if (isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      `${sourceName} must not point to localhost or any loopback address when NODE_ENV=production.`
    );
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${sourceName} must use HTTPS when NODE_ENV=production.`);
  }
}

function resolveAppOrigin(env: NodeJS.ProcessEnv, nodeEnv: AppConfig["nodeEnv"]) {
  const rawAppOrigin = env.APP_ORIGIN?.trim() ?? "";
  if (!rawAppOrigin) {
    if (nodeEnv === "production") {
      throw new Error("APP_ORIGIN must be explicitly set to a valid absolute HTTPS URL when NODE_ENV=production.");
    }

    return "http://localhost:5173";
  }

  const parsed = parseAbsoluteUrl(rawAppOrigin, "APP_ORIGIN");
  if (nodeEnv === "production") {
    validateProductionPublicUrl(parsed, "APP_ORIGIN");
  }

  return parsed.origin;
}

function resolveNotificationBaseUrl(
  env: NodeJS.ProcessEnv,
  nodeEnv: AppConfig["nodeEnv"],
  appOrigin: string
) {
  const rawNotificationBaseUrl = env.NOTIFICATION_BASE_URL?.trim() ?? "";
  if (rawNotificationBaseUrl) {
    const parsed = parseAbsoluteUrl(rawNotificationBaseUrl, "NOTIFICATION_BASE_URL");
    if (nodeEnv === "production") {
      validateProductionPublicUrl(parsed, "NOTIFICATION_BASE_URL");
    }
    return trimTrailingSlash(parsed.toString());
  }

  return appOrigin;
}

function resolveSessionSecret(rawValue: string | undefined, nodeEnv: AppConfig["nodeEnv"]) {
  const value = rawValue?.trim() ?? "";
  if (value) {
    return value;
  }

  if (nodeEnv === "production") {
    return "";
  }

  return DEV_SESSION_SECRET;
}

function getDistinctCharacterCount(value: string) {
  return new Set(Array.from(value)).size;
}

function isRepeatedPattern(value: string) {
  const chars = Array.from(value);
  const maxPatternLength = Math.floor(chars.length / 2);

  for (let patternLength = 1; patternLength <= maxPatternLength; patternLength += 1) {
    let matches = true;
    for (let index = patternLength; index < chars.length; index += 1) {
      if (chars[index] !== chars[index % patternLength]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

function getMonotoneSequencePrefixLength(value: string, alphabet: string) {
  const chars = Array.from(value);
  if (chars.length === 0 || !alphabet.includes(chars[0] ?? "")) {
    return 0;
  }

  let maxPrefixLength = 1;

  for (const direction of [1, -1]) {
    let prefixLength = 1;
    let previousIndex = alphabet.indexOf(chars[0] ?? "");

    for (let index = 1; index < chars.length; index += 1) {
      const currentIndex = alphabet.indexOf(chars[index] ?? "");
      if (currentIndex === -1) {
        break;
      }

      if (currentIndex !== (previousIndex + direction + alphabet.length) % alphabet.length) {
        break;
      }

      prefixLength += 1;
      previousIndex = currentIndex;
    }

    if (prefixLength > maxPrefixLength) {
      maxPrefixLength = prefixLength;
    }
  }

  return maxPrefixLength;
}

function isEntireMonotoneSequence(value: string) {
  if (value.length <= 1) {
    return false;
  }

  return OBVIOUS_SESSION_SECRET_SEQUENCES.some(
    (alphabet) => getMonotoneSequencePrefixLength(value, alphabet) === value.length
  );
}

function isSmallWeakSegment(value: string) {
  if (value.length === 0) {
    return true;
  }

  const distinctCharacterCount = getDistinctCharacterCount(value);

  if (distinctCharacterCount === 1) {
    return true;
  }

  if (/^\d+$/.test(value)) {
    return true;
  }

  if (isRepeatedPattern(value)) {
    return true;
  }

  return isEntireMonotoneSequence(value);
}

function isCompositeSequenceSecret(value: string, remainingSegments = MAX_OBVIOUS_SEQUENCE_SEGMENTS): boolean {
  if (value.length === 0) {
    return true;
  }

  if (remainingSegments === 0) {
    return false;
  }

  for (const alphabet of OBVIOUS_SESSION_SECRET_SEQUENCES) {
    const prefixLength = getMonotoneSequencePrefixLength(value, alphabet);
    if (prefixLength < MIN_OBVIOUS_SEQUENCE_SEGMENT_LENGTH) {
      continue;
    }

    const remainder = value.slice(prefixLength);
    if (remainder.length === 0) {
      return true;
    }

    if (remainder.length <= MAX_OBVIOUS_SEQUENCE_SUFFIX_LENGTH && isSmallWeakSegment(remainder)) {
      return true;
    }

    if (isCompositeSequenceSecret(remainder, remainingSegments - 1)) {
      return true;
    }
  }

  return false;
}

function isObviouslyWeakSessionSecret(value: string) {
  const normalizedValue = value.toLowerCase();
  const distinctCharacterCount = getDistinctCharacterCount(normalizedValue);

  if (distinctCharacterCount === 1) {
    return true;
  }

  if (/^\d+$/.test(value)) {
    return true;
  }

  if (isRepeatedPattern(normalizedValue)) {
    return true;
  }

  if (distinctCharacterCount < MIN_PRODUCTION_SESSION_SECRET_DISTINCT_CHARACTERS) {
    return true;
  }

  if (isEntireMonotoneSequence(normalizedValue)) {
    return true;
  }

  return isCompositeSequenceSecret(normalizedValue);
}

function validateRuntimeSecurityConfig(config: Pick<AppConfig, "nodeEnv" | "sessionSecret" | "cookieSecure">) {
  if (config.nodeEnv !== "production") {
    return;
  }

  const sessionSecret = config.sessionSecret.trim();
  const normalizedSessionSecret = sessionSecret.toLowerCase();

  if (!sessionSecret) {
    throw new Error(
      "SESSION_SECRET must be set to a unique non-placeholder value when NODE_ENV=production."
    );
  }

  if (INSECURE_SESSION_SECRET_VALUES.has(normalizedSessionSecret)) {
    throw new Error(
      "SESSION_SECRET must not use a known placeholder value when NODE_ENV=production. Set a unique long random secret."
    );
  }

  if (sessionSecret.length < MIN_PRODUCTION_SESSION_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be set to a strong production secret with at least ${MIN_PRODUCTION_SESSION_SECRET_LENGTH} characters.`
    );
  }

  // Keep the heuristic intentionally small and predictable: reject only obviously trivial secrets.
  if (isObviouslyWeakSessionSecret(sessionSecret)) {
    throw new Error(
      "SESSION_SECRET must not be an obvious weak or pattern-based value when NODE_ENV=production. Use a unique long random secret."
    );
  }

  if (!config.cookieSecure) {
    throw new Error("COOKIE_SECURE must be true when NODE_ENV=production.");
  }
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
    parsePostgresUrl(explicitDatabaseUrl, "DATABASE_URL");
    return explicitDatabaseUrl;
  }

  if (nodeEnv === "production") {
    throw new Error("DATABASE_URL must be explicitly set to a valid PostgreSQL URL when NODE_ENV=production.");
  }

  return DEFAULT_DATABASE_URL;
}

function resolveEntraRedirectUri(
  env: NodeJS.ProcessEnv,
  nodeEnv: AppConfig["nodeEnv"],
  authEnableEntra: boolean
) {
  const rawEntraRedirectUri = env.ENTRA_REDIRECT_URI?.trim() ?? "";

  if (!rawEntraRedirectUri) {
    if (authEnableEntra && nodeEnv === "production") {
      throw new Error(
        "ENTRA_REDIRECT_URI must be explicitly set to a valid absolute HTTPS URL when AUTH_ENABLE_ENTRA=true and NODE_ENV=production."
      );
    }

    return nodeEnv === "production" ? "" : DEFAULT_ENTRA_REDIRECT_URI;
  }

  const parsed = parseAbsoluteUrl(rawEntraRedirectUri, "ENTRA_REDIRECT_URI");
  if (nodeEnv === "production") {
    validateProductionPublicUrl(parsed, "ENTRA_REDIRECT_URI");
  }

  return rawEntraRedirectUri;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadProjectEnvFile();

  const nodeEnv = env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development";
  const appOrigin = resolveAppOrigin(env, nodeEnv);
  const authEnableEntra = toBoolean(env.AUTH_ENABLE_ENTRA, false);

  const config: AppConfig = {
    port: toInteger(env.PORT, 4000),
    databaseUrl: resolveDatabaseUrl(env, nodeEnv),
    appOrigin,
    notificationBaseUrl: resolveNotificationBaseUrl(env, nodeEnv, appOrigin),
    legacyRecoveryEndpointsEnabled: toBoolean(env.ENABLE_LEGACY_RECOVERY_ENDPOINTS, false),
    notificationDispatchEnabled: toBoolean(env.NOTIFICATION_DISPATCH_ENABLED, false),
    notificationDryRun: toBoolean(env.NOTIFICATION_DRY_RUN, false),
    notificationFromLabel: env.NOTIFICATION_FROM_LABEL?.trim() || "Nemetz Portal",
    powerAutomateNotificationWebhookUrl: env.POWER_AUTOMATE_NOTIFICATION_WEBHOOK_URL?.trim() || "",
    powerAutomateNotificationSecret: env.POWER_AUTOMATE_NOTIFICATION_SECRET?.trim() || "",
    notificationMaxAttempts: toInteger(env.NOTIFICATION_MAX_ATTEMPTS, 5),
    notificationDispatchBatchSize: toInteger(env.NOTIFICATION_DISPATCH_BATCH_SIZE, 25),
    notificationDispatchTimeoutMs: Math.min(
      toInteger(env.NOTIFICATION_DISPATCH_TIMEOUT_MS, 15_000),
      MAX_NOTIFICATION_DISPATCH_TIMEOUT_MS
    ),
    perfLoggingEnabled: toBoolean(env.PERF_LOGGING_ENABLED, false),
    notificationClaimLeaseSeconds: toInteger(env.NOTIFICATION_CLAIM_LEASE_SECONDS, 300),
    notificationTimeZone: env.NOTIFICATION_TIMEZONE?.trim() || "Europe/Vienna",
    sessionSecret: resolveSessionSecret(env.SESSION_SECRET, nodeEnv),
    nodeEnv,
    resetTokenTtlMinutes: toInteger(
      env.PASSWORD_RESET_TOKEN_TTL_MINUTES?.trim() || env.RESET_TOKEN_TTL_MINUTES?.trim(),
      120
    ),
    sessionTtlDays: toInteger(env.SESSION_TTL_DAYS, 7),
    cookieSecure: toBoolean(env.COOKIE_SECURE, nodeEnv === "production"),
    basePath: normalizeBasePath(env.BASE_PATH),
    authEnableEntra,
    entraTenantId: env.ENTRA_TENANT_ID?.trim() || "",
    entraClientId: env.ENTRA_CLIENT_ID?.trim() || "",
    entraClientSecret: env.ENTRA_CLIENT_SECRET?.trim() || "",
    entraRedirectUri: resolveEntraRedirectUri(env, nodeEnv, authEnableEntra),
    entraAllowedDomains: toList(env.ENTRA_ALLOWED_DOMAINS, ["nemetz-ag.at"]),
    entraAutoProvision: toBoolean(env.ENTRA_AUTO_PROVISION, false),
    entraScopes: toList(env.ENTRA_SCOPES, ["openid", "profile", "email"]),
    uploadDir: env.UPLOAD_DIR?.trim() || undefined,
    documentsStorageDir:
      env.DOCUMENTS_STORAGE_DIR?.trim() ||
      (nodeEnv === "production" ? "/data/uploads" : "storage/uploads"),
    legacyDocumentsStorageDir: env.DOCUMENTS_STORAGE_DIR?.trim() || undefined,
    documentsMaxUploadBytes: toInteger(env.DOCUMENTS_MAX_UPLOAD_MB, 20) * 1024 * 1024
  };

  validateRuntimeSecurityConfig(config);

  return config;
}
