import { getRuntimeConfigSnapshot } from "../../config/runtimeConfig";
import { clearAllFiles } from "../../services/fileStorage";
import {
  clearPersistedValue,
  parsePersistedPayload,
  safeParse,
  STORAGE_KEYS,
  STORAGE_VERSION
} from "../persistence";
import type { ExportDataBundle, ExportPayload } from "./types";

function readStorageValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  const parsed = safeParse(raw);
  if (parsed === null) {
    return fallback;
  }

  const persisted = parsePersistedPayload<T>(parsed);
  if (persisted) {
    return persisted.data;
  }

  return parsed as T;
}

export function buildExportPayload(data: ExportDataBundle): ExportPayload {
  const runtimeConfig = getRuntimeConfigSnapshot();
  return {
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    app: {
      name: runtimeConfig.appName,
      buildLabel: runtimeConfig.buildLabel
    },
    data: {
      ...data,
      featureFlagsSnapshot: runtimeConfig.features
    }
  };
}

export function buildStorageExportPayload() {
  const payload = buildExportPayload({
    scopes: readStorageValue(STORAGE_KEYS.scopes, {
      companies: [],
      sites: [],
      facilities: []
    }),
    authorities: readStorageValue(STORAGE_KEYS.authorities, {
      authorities: [],
      contacts: []
    }),
    users: readStorageValue(STORAGE_KEYS.users, []),
    projects: readStorageValue(STORAGE_KEYS.projects, []),
    legalDocs: readStorageValue(STORAGE_KEYS.legalDocs, []),
    obligations: readStorageValue(STORAGE_KEYS.obligations, []),
    deadlines: readStorageValue(STORAGE_KEYS.deadlines, []),
    taskState: readStorageValue(STORAGE_KEYS.taskState, {}),
    auditLog: readStorageValue(STORAGE_KEYS.auditLog, []),
    notifications: readStorageValue(STORAGE_KEYS.notifications, [])
  });

  return payload;
}

export function downloadExportPayload(payload: ExportPayload, filePrefix = "nemetz-compliance-data") {
  if (typeof window === "undefined") {
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function resetAllPersistedData() {
  Object.values(STORAGE_KEYS).forEach((key) => clearPersistedValue(key));
  void clearAllFiles();
}
