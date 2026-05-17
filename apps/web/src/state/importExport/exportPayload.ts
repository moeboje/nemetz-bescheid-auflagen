import { getRuntimeConfigSnapshot } from "../../config/runtimeConfig";
import { clearAllFiles } from "../../services/fileStorage";
import { listAuthorities } from "../../api/authorities";
import { listDeadlines } from "../../api/deadlines";
import { listLegacyDecisions } from "../../api/legacyDecisions";
import { getLegalDoc, listLegalDocs } from "../../api/legalDocs";
import { listObligations } from "../../api/obligations";
import { listAdminProcedureMasterData } from "../../api/procedureMasterData";
import { listProjectChecklists } from "../../api/projectChecklists";
import { getProject, listProjects } from "../../api/projects";
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
  legacyDecisions: Awaited<ReturnType<typeof readLegacyDecisionsForExport>>;
  legalDocs: Awaited<ReturnType<typeof readLegalDocsForExport>>;
  obligations: Awaited<ReturnType<typeof readObligationsForExport>>;
  procedureMasterData: Awaited<ReturnType<typeof readProcedureMasterDataForExport>>;
  projectChecklists: Awaited<ReturnType<typeof readProjectChecklistsForExport>>;
  projects: Awaited<ReturnType<typeof readProjectsForExport>>;
  scopes: Awaited<ReturnType<typeof readScopesForExport>>;
  taskState: Awaited<ReturnType<typeof readTaskStateForExport>>;
};

type StorageExportPayloadOverrides = Pick<ExportDataBundle, "auditLog" | "notifications">;

const EXPORT_DETAIL_REQUEST_CONCURRENCY = 5;

export const GENERIC_EXPORT_LIMITATION_META: NonNullable<ExportPayload["meta"]> = {
  warnings: [
    "This JSON export is only a partial recovery artifact. It does not provide a full disaster-recovery backup of all server-managed administration and security data.",
    "Users, roles, external organizations, security settings, notification settings, notification outbox history, document files and document approval history are server-managed and are intentionally omitted from generic exports because generic imports do not restore them."
  ],
  omittedDomains: [
    "users",
    "roles",
    "externalOrgs",
    "securitySettings",
    "notificationSettings",
    "notificationOutbox",
    "documents",
    "documentApprovalRequests",
    "documentApprovalEvents"
  ]
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

export function buildExportPayload(
  data: ExportDataBundle,
  options: {
    meta?: ExportPayload["meta"];
  } = {}
): ExportPayload {
  const runtimeConfig = getRuntimeConfigSnapshot();
  const payload: ExportPayload = {
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

  if (options.meta) {
    payload.meta = options.meta;
  }

  return payload;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  if (!items.length) {
    return [];
  }

  const results = new Array<R>(items.length);
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(limit)));
  let nextIndex = 0;
  let failed = false;

  async function runWorker() {
    while (!failed) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function readAuthoritiesForExport() {
  return listAuthorities();
}

async function readScopesForExport() {
  return listScopes();
}

async function readProjectsForExport() {
  const projects = await listProjects();
  return mapWithConcurrency(
    projects,
    EXPORT_DETAIL_REQUEST_CONCURRENCY,
    (project) => getProject(project.id)
  );
}

async function readProcedureMasterDataForExport() {
  return listAdminProcedureMasterData();
}

async function readProjectChecklistsForExport() {
  return listProjectChecklists();
}

async function readLegalDocsForExport() {
  const legalDocs = await listLegalDocs();
  return mapWithConcurrency(
    legalDocs,
    EXPORT_DETAIL_REQUEST_CONCURRENCY,
    (legalDoc) => getLegalDoc(legalDoc.id)
  );
}

async function readLegacyDecisionsForExport() {
  return listLegacyDecisions();
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
    ["procedureMasterData", readProcedureMasterDataForExport],
    ["projects", readProjectsForExport],
    ["projectChecklists", readProjectChecklistsForExport],
    ["legalDocs", readLegalDocsForExport],
    ["legacyDecisions", readLegacyDecisionsForExport],
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

export async function buildStorageExportPayload(
  overrides: StorageExportPayloadOverrides = {}
) {
  const serverDomains = await readServerDomainsForExport();
  const payload = buildExportPayload({
    scopes: serverDomains.scopes,
    authorities: serverDomains.authorities,
    procedureMasterData: serverDomains.procedureMasterData,
    projects: serverDomains.projects,
    projectChecklists: serverDomains.projectChecklists,
    legalDocs: serverDomains.legalDocs,
    legacyDecisions: serverDomains.legacyDecisions,
    obligations: serverDomains.obligations,
    deadlines: serverDomains.deadlines,
    taskState: serverDomains.taskState,
    auditLog: overrides.auditLog ?? readStorageValue(STORAGE_KEYS.auditLog, []),
    notifications: overrides.notifications ?? readStorageValue(STORAGE_KEYS.notifications, [])
  }, {
    meta: GENERIC_EXPORT_LIMITATION_META
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
