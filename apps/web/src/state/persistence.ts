export const STORAGE_VERSION = 1;

const SAVE_DEBOUNCE_MS = 250;
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type PersistedPayload<T> = {
  version: number;
  timestamp: string;
  data: T;
};

type MigrationOptions<T> = {
  fallback?: T;
  migrate?: (value: unknown, fromVersion: number) => T | null;
};

type NormalizedPayload = {
  version: number;
  timestamp?: string;
  data: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersistedPayload<T>(value: unknown): value is PersistedPayload<T> {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value.version === "number" &&
    typeof value.timestamp === "string" &&
    Object.prototype.hasOwnProperty.call(value, "data")
  );
}

function toPersistedPayload(raw: unknown): NormalizedPayload | null {
  if (isPersistedPayload(raw)) {
    return {
      version: raw.version,
      timestamp: raw.timestamp,
      data: raw.data
    };
  }

  if (isObject(raw) && Object.prototype.hasOwnProperty.call(raw, "data")) {
    const version = typeof raw.version === "number" ? raw.version : 0;
    return {
      version,
      timestamp: typeof raw.timestamp === "string" ? raw.timestamp : undefined,
      data: raw.data
    };
  }

  if (raw === null || raw === undefined) {
    return null;
  }

  // Legacy raw values (without envelope) are treated as version 0.
  return { version: 0, data: raw };
}

function buildPayload<T>(data: T): PersistedPayload<T> {
  return {
    version: STORAGE_VERSION,
    timestamp: new Date().toISOString(),
    data
  };
}

export function makeStorageKey(name: string) {
  return `nemetzCompliance.v${STORAGE_VERSION}.${name}`;
}

export const STORAGE_KEYS = {
  scopes: makeStorageKey("scopes"),
  authorities: makeStorageKey("authorities"),
  projects: makeStorageKey("projects"),
  legalDocs: makeStorageKey("legalDocs"),
  obligations: makeStorageKey("obligations"),
  deadlines: makeStorageKey("deadlines"),
  taskState: makeStorageKey("taskState"),
  auditLog: makeStorageKey("auditLog"),
  users: makeStorageKey("users")
} as const;

export function safeParse<T = unknown>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function saveWithEnvelope<T>(key: string, data: T) {
  const serialized = safeStringify(buildPayload(data));
  if (!serialized || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, serialized);
  } catch {
    // ignore browser storage errors in prototype mode
  }
}

export function migrateStorage<T>(
  key: string,
  payload: NormalizedPayload,
  options?: MigrationOptions<T>
): T | null {
  const migrate = options?.migrate;
  const fromVersion = payload.version;

  if (!migrate) {
    if (fromVersion !== STORAGE_VERSION) {
      return null;
    }
    return payload.data as T;
  }

  return migrate(payload.data, fromVersion);
}

export function loadJSON<T>(key: string, options?: MigrationOptions<T>): T | null {
  if (typeof window === "undefined") {
    return options?.fallback ?? null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return options?.fallback ?? null;
  }

  const parsed = safeParse<unknown>(raw);
  if (parsed === null) {
    return options?.fallback ?? null;
  }

  const normalized = toPersistedPayload(parsed);
  if (!normalized) {
    return options?.fallback ?? null;
  }

  const migrated = migrateStorage<T>(key, normalized, options);
  if (migrated === null) {
    return options?.fallback ?? null;
  }

  if (normalized.version !== STORAGE_VERSION) {
    saveWithEnvelope(key, migrated);
  }

  return migrated;
}

export function saveJSON<T>(key: string, data: T) {
  if (typeof window === "undefined") {
    return;
  }

  const timer = saveTimers.get(key);
  if (timer) {
    clearTimeout(timer);
  }

  const nextTimer = setTimeout(() => {
    saveWithEnvelope(key, data);
    saveTimers.delete(key);
  }, SAVE_DEBOUNCE_MS);

  saveTimers.set(key, nextTimer);
}

export function createExportPayload<T>(data: T): PersistedPayload<T> {
  return buildPayload(data);
}

export function parsePersistedPayload<T>(value: unknown): PersistedPayload<T> | null {
  if (!isPersistedPayload<T>(value)) {
    return null;
  }
  return value;
}

export function loadPersistedValue<T>(
  key: string,
  fallback: T,
  migrate?: (value: unknown, fromVersion: number) => T | null
): T {
  return loadJSON<T>(key, { fallback, migrate }) ?? fallback;
}

export function savePersistedValue<T>(key: string, data: T) {
  saveJSON(key, data);
}

export function clearPersistedValue(key: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore local storage errors in browser-only prototype
  }
}
