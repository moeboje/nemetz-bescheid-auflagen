import { getRuntimeConfigSnapshot } from "../../config/runtimeConfig";
import { clearAllFiles } from "../../services/fileStorage";
import { listAuthorities } from "../../api/authorities";
import { listDeadlines } from "../../api/deadlines";
import { listLegalDocs } from "../../api/legalDocs";
import { listObligations } from "../../api/obligations";
import { listProjectChecklists } from "../../api/projectChecklists";
import { listProjects } from "../../api/projects";
import { listScopes } from "../../api/scopes";
import { listTaskState } from "../../api/taskState";
import {
  clearPersistedValue,
  parsePersistedPayload,
  safeParse,
  STORAGE_KEYS,
  STORAGE_VERSION
} from "../persistence";
import type { ExportDataBundle, ExportPayload } from "./types";

type ServerDomainReaderResult = {
  authorities: Awaited<ReturnType<typeof readAuthoritiesForExport>>;
  deadlines: Awaited<ReturnType<typeof readDeadlinesForExport>>;
  legalDocs: Awaited<ReturnType<typeof readLegalDocsForExport>>;
  obligations: Awaited<ReturnType<typeof readObligationsForExport>>;
  projectChecklists: Awaited<ReturnType<typeof readProjectChecklistsForExport>>;
  projects: Awaited<ReturnType<typeof readProjectsForExport>>;
  scopes: Awaited<ReturnType<typeof readScopesForExport>>;
  taskState: Awaited<ReturnType<typeof readTaskStateForExport>>;
};

export class RecoveryExportError extends Error {
  readonly missingDomains: string[];

  constructor(missingDomains: string[]) {
    super(
      `Recovery export failed because server data could not be loaded for: ${missingDomains.join(", ")}`
    );
    this.name = "RecoveryExportError";
    this.missingDomains = missingDomains;
  }
}

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

async function readAuthoritiesForExport() {
  return listAuthorities();
}

async function readScopesForExport() {
  return listScopes();
}

async function readProjectsForExport() {
  return listProjects();
}

async function readProjectChecklistsForExport() {
  return listProjectChecklists();
}

async function readLegalDocsForExport() {
  return listLegalDocs();
}

async function readObligationsForExport() {
  return listObligations();
}

async function readDeadlinesForExport() {
  return listDeadlines();
}

async function readTaskStateForExport() {
  return listTaskState();
}

async function readServerDomainsForExport(): Promise<ServerDomainReaderResult> {
  const readers = [
    ["scopes", readScopesForExport],
    ["authorities", readAuthoritiesForExport],
    ["projects", readProjectsForExport],
    ["projectChecklists", readProjectChecklistsForExport],
    ["legalDocs", readLegalDocsForExport],
    ["obligations", readObligationsForExport],
    ["deadlines", readDeadlinesForExport],
    ["taskState", readTaskStateForExport]
  ] as const;

  const settled = await Promise.allSettled(readers.map(([, reader]) => reader()));
  const missingDomains = settled
    .map((result, index) => (result.status === "rejected" ? readers[index][0] : null))
    .filter((domain): domain is string => Boolean(domain));

  if (missingDomains.length > 0) {
    throw new RecoveryExportError(missingDomains);
  }

  return Object.fromEntries(
    settled.map((result, index) => [readers[index][0], (result as PromiseFulfilledResult<unknown>).value])
  ) as ServerDomainReaderResult;
}

export async function buildStorageExportPayload() {
  const serverDomains = await readServerDomainsForExport();
  const payload = buildExportPayload({
    scopes: serverDomains.scopes,
    authorities: serverDomains.authorities,
    users: readStorageValue(STORAGE_KEYS.users, []),
    projects: serverDomains.projects,
    projectChecklists: serverDomains.projectChecklists,
    legalDocs: serverDomains.legalDocs,
    obligations: serverDomains.obligations,
    deadlines: serverDomains.deadlines,
    taskState: serverDomains.taskState,
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
