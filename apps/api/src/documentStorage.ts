import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";

const LEGACY_DOCUMENT_STORAGE_PREFIX = "uploads/";

function resolveConfiguredStorageRoot(configured: string) {
  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(process.cwd(), configured);
}

function resolveUploadDir(config: AppConfig) {
  const explicitUploadRoot = config.uploadDir?.trim();
  if (explicitUploadRoot) {
    return resolveConfiguredStorageRoot(explicitUploadRoot);
  }

  const configured = config.documentsStorageDir.trim() || (config.nodeEnv === "production" ? "/data/uploads" : "storage/uploads");
  const resolved = resolveConfiguredStorageRoot(configured);

  return path.basename(resolved) === "uploads" ? resolved : path.resolve(resolved, "uploads");
}

function resolveLegacyDocumentsStorageRoot(config: AppConfig) {
  const configured = config.legacyDocumentsStorageDir?.trim();
  return configured ? resolveConfiguredStorageRoot(configured) : null;
}

function isPathInsideDirectory(candidatePath: string, rootPath: string) {
  const relative = path.relative(rootPath, candidatePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeDocumentStorageKeySegment(value: string) {
  return value
    .replace(/\\/g, "_")
    .replace(/\//g, "_")
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim() || "document";
}

export function createDocumentStoragePath(documentId: string, createdAt = new Date()) {
  const year = String(createdAt.getUTCFullYear());
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  const safeDocumentId = safeDocumentStorageKeySegment(documentId).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  return path.posix.join(
    "documents",
    year,
    month,
    `${safeDocumentId || "document"}-${randomUUID()}`
  );
}

function normalizeStoredDocumentStorageKey(storagePath: string, options: { stripLegacyPrefix: boolean }) {
  const trimmed = storagePath.replace(/\0/g, "").trim();
  if (!trimmed || path.isAbsolute(trimmed)) {
    return null;
  }

  const posixPath = trimmed.replace(/\\/g, "/");
  const segments = posixPath.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  const normalized = path.posix.normalize(segments.join("/"));
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    return null;
  }

  return options.stripLegacyPrefix && normalized.startsWith(LEGACY_DOCUMENT_STORAGE_PREFIX)
    ? normalized.slice(LEGACY_DOCUMENT_STORAGE_PREFIX.length)
    : normalized;
}

function addSafeDocumentPathCandidate(candidates: string[], candidatePath: string, rootPath: string) {
  const resolvedCandidate = path.resolve(candidatePath);
  if (!isPathInsideDirectory(resolvedCandidate, rootPath)) {
    return;
  }

  if (!candidates.includes(resolvedCandidate)) {
    candidates.push(resolvedCandidate);
  }
}

function resolveStoredDocumentPathCandidates(config: AppConfig, storagePath: string) {
  const uploadRoot = resolveUploadDir(config);
  const legacyRoot = resolveLegacyDocumentsStorageRoot(config);
  const candidates: string[] = [];

  if (path.isAbsolute(storagePath)) {
    const absolutePath = path.resolve(storagePath);
    addSafeDocumentPathCandidate(candidates, absolutePath, uploadRoot);
    if (legacyRoot) {
      addSafeDocumentPathCandidate(candidates, absolutePath, legacyRoot);
    }

    return {
      isSafe: candidates.length > 0,
      candidates
    };
  }

  const currentStorageKey = normalizeStoredDocumentStorageKey(storagePath, { stripLegacyPrefix: true });
  const legacyExactStorageKey = normalizeStoredDocumentStorageKey(storagePath, { stripLegacyPrefix: false });
  if (!currentStorageKey || !legacyExactStorageKey) {
    return {
      isSafe: false,
      candidates
    };
  }

  const isLegacyUploadsKey = legacyExactStorageKey.startsWith(LEGACY_DOCUMENT_STORAGE_PREFIX);
  if (legacyRoot && isLegacyUploadsKey) {
    addSafeDocumentPathCandidate(candidates, path.resolve(legacyRoot, legacyExactStorageKey), legacyRoot);
    addSafeDocumentPathCandidate(candidates, path.resolve(uploadRoot, legacyExactStorageKey), uploadRoot);
    if (currentStorageKey !== legacyExactStorageKey) {
      addSafeDocumentPathCandidate(candidates, path.resolve(uploadRoot, currentStorageKey), uploadRoot);
      addSafeDocumentPathCandidate(candidates, path.resolve(legacyRoot, currentStorageKey), legacyRoot);
    }
  } else {
    addSafeDocumentPathCandidate(candidates, path.resolve(uploadRoot, legacyExactStorageKey), uploadRoot);
    if (currentStorageKey !== legacyExactStorageKey) {
      addSafeDocumentPathCandidate(candidates, path.resolve(uploadRoot, currentStorageKey), uploadRoot);
    }
    if (legacyRoot) {
      addSafeDocumentPathCandidate(candidates, path.resolve(legacyRoot, legacyExactStorageKey), legacyRoot);
    }
  }

  if (legacyRoot && !isLegacyUploadsKey && currentStorageKey !== legacyExactStorageKey) {
    addSafeDocumentPathCandidate(candidates, path.resolve(legacyRoot, currentStorageKey), legacyRoot);
  }

  return {
    isSafe: true,
    candidates
  };
}

export function resolveStoredDocumentPath(config: AppConfig, storagePath: string) {
  const resolution = resolveStoredDocumentPathCandidates(config, storagePath);
  return resolution.isSafe ? resolution.candidates[0] ?? null : null;
}

export async function resolveExistingStoredDocumentPath(config: AppConfig, storagePath: string) {
  const resolution = resolveStoredDocumentPathCandidates(config, storagePath);
  if (!resolution.isSafe) {
    return {
      isSafe: false,
      absoluteFilePath: null
    };
  }

  for (const candidate of resolution.candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return {
          isSafe: true,
          absoluteFilePath: candidate
        };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        throw error;
      }
    }
  }

  return {
    isSafe: true,
    absoluteFilePath: null
  };
}
