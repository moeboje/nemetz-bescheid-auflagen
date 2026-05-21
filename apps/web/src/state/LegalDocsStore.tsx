import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  LegalDoc,
  LegalDocAiExtraction,
  LegalDocAttachment,
  legalDocs as initialLegalDocs
} from "../data/legalDocs";
import { useAuth } from "./AuthStore";
import { useAuditLog } from "./AuditLogStore";
import { useProjects } from "./ProjectsStore";
import { clearPersistedValue, makeStorageKey } from "./persistence";
import { useScopes } from "./ScopesStore";
import { normalizeAiAnalysisResult } from "../services/aiResultValidation";
import {
  archiveLegalDoc as apiArchiveLegalDoc,
  bulkDeleteLegalDocs,
  bulkReplaceLegalDocs,
  createLegalDoc as apiCreateLegalDoc,
  getLegalDoc as apiGetLegalDoc,
  listLegalDocProjectOptions,
  listLegalDocs,
  lookupLegalDocs,
  restoreLegalDoc as apiRestoreLegalDoc,
  updateLegalDoc as apiUpdateLegalDoc,
  type LegalDocLookup
} from "../api/legalDocs";
import { getOrCreateInFlight } from "./inFlightDedupe";
import type { DomainProjectOption } from "../data/projects";
import { shouldAutoLoadDomainStore } from "./routeLoading";

type LegalDocCreateInput = Omit<
  LegalDoc,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "isArchived"
  | "archivedAt"
  | "attachments"
  | "projectTitle"
  | "currentUserCanWriteProject"
> & {
  id?: string;
  attachments?: LegalDocAttachment[];
};

export type LegalDocsContextValue = {
  legalDocs: LegalDoc[];
  writableProjectOptions: DomainProjectOption[];
  addLegalDoc: (input: LegalDocCreateInput) => Promise<LegalDoc | null>;
  updateLegalDoc: (id: string, input: Partial<LegalDoc>) => Promise<LegalDoc | null>;
  archiveLegalDoc: (id: string) => Promise<LegalDoc | null>;
  restoreLegalDoc: (id: string) => Promise<LegalDoc | null>;
  addLegalDocAttachment: (legalDocId: string, attachment: LegalDocAttachment) => Promise<boolean>;
  removeLegalDocAttachment: (legalDocId: string, attachmentId: string) => Promise<boolean>;
  getEffectiveScope: (legalDoc: LegalDoc) =>
    | { companyId: string; siteId?: string; facilityId?: string }
    | undefined;
  getEffectiveScopeForLegalDoc: (legalDoc: LegalDoc) =>
    | { companyId: string; siteId?: string; facilityId?: string }
    | undefined;
  getEffectiveScopeLabel: (legalDoc: LegalDoc) => string;
  getLegalDocsForProject: (projectId: string) => LegalDoc[];
  replaceLegalDocs: (value: LegalDoc[]) => Promise<void>;
  resetLegalDocs: () => Promise<void>;
  reloadLegalDocs: () => Promise<LegalDoc[]>;
  ensureLegalDocLookups: (input: { ids?: string[]; projectId?: string }) => Promise<LegalDoc[]>;
  loadLegalDocDetail: (id: string) => Promise<LegalDoc | null>;
};

const LegalDocsContext = createContext<LegalDocsContextValue | undefined>(undefined);

export const LEGAL_DOCS_STORAGE_KEY = makeStorageKey("legalDocs");

function nowStamp() {
  return new Date().toISOString();
}

function hasOwnInput(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeAttachment(
  attachment: Partial<LegalDocAttachment>,
  fallbackId: string
): LegalDocAttachment {
  return {
    id: typeof attachment.id === "string" && attachment.id.trim() ? attachment.id : fallbackId,
    filename: attachment.filename ?? "",
    sizeKb: Number.isFinite(attachment.sizeKb) ? Number(attachment.sizeKb) : 0,
    mime: attachment.mime ?? undefined,
    addedAt: attachment.addedAt ?? nowStamp().slice(0, 10),
    addedByLabel: attachment.addedByLabel ?? undefined
  };
}

function normalizeAiExtraction(value: unknown): LegalDocAiExtraction | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return normalizeAiAnalysisResult(value);
}

function normalizeLegalDoc(value: Partial<LegalDoc>, index: number): LegalDoc | null {
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.projectId !== "string" ||
    !value.projectId.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.type !== "string" ||
    !value.type.trim()
  ) {
    return null;
  }

  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt : nowStamp();
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt
      : createdAt;

  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map((attachment, attachmentIndex) =>
        normalizeAttachment(attachment, `lda-seed-${value.id}-${index}-${attachmentIndex}`)
      )
    : [];

  const scopeOverride =
    value.scopeOverride && typeof value.scopeOverride.companyId === "string"
      ? {
          companyId: value.scopeOverride.companyId,
          siteId: value.scopeOverride.siteId ?? undefined,
          facilityId: value.scopeOverride.facilityId ?? undefined
        }
      : undefined;

  return {
    id: value.id,
    projectId: value.projectId,
    type: value.type,
    title: value.title,
    shortDescription: value.shortDescription ?? "",
    detailedDescription:
      typeof value.detailedDescription === "string" ? value.detailedDescription : undefined,
    contentSummary: typeof value.contentSummary === "string" ? value.contentSummary : undefined,
    reference: value.reference ?? "",
    issuedAt: value.issuedAt ?? "",
    authorityId: typeof value.authorityId === "string" ? value.authorityId : undefined,
    authorityContactId:
      typeof value.authorityContactId === "string" ? value.authorityContactId : undefined,
    attachments,
    aiExtraction: normalizeAiExtraction(value.aiExtraction),
    scopeOverride,
    projectTitle: value.projectTitle ?? undefined,
    currentUserCanWriteProject: Boolean(value.currentUserCanWriteProject),
    archivedAt: value.archivedAt ?? undefined,
    isArchived: Boolean(value.isArchived || value.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeLegalDocs(value: unknown): LegalDoc[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((doc, index) => normalizeLegalDoc(doc as Partial<LegalDoc>, index))
    .filter((doc): doc is LegalDoc => Boolean(doc));
}

type LegalDocLookupState = Pick<
  LegalDoc,
  "id" | "projectId" | "type" | "title" | "isArchived" | "createdAt" | "updatedAt"
> &
  Partial<Omit<LegalDoc, "id" | "projectId" | "type" | "title" | "isArchived" | "createdAt" | "updatedAt">>;

function normalizeLegalDocLookup(value: Partial<LegalDocLookup>, index: number): LegalDocLookupState | null {
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.projectId !== "string" ||
    !value.projectId.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.type !== "string" ||
    !value.type.trim()
  ) {
    return null;
  }

  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt : nowStamp();
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt
      : createdAt;
  const scopeOverride =
    value.scopeOverride && typeof value.scopeOverride.companyId === "string"
      ? {
          companyId: value.scopeOverride.companyId,
          siteId: value.scopeOverride.siteId ?? undefined,
          facilityId: value.scopeOverride.facilityId ?? undefined
        }
      : undefined;

  return {
    id: value.id,
    projectId: value.projectId,
    type: value.type,
    title: value.title,
    shortDescription: value.shortDescription ?? "",
    reference: value.reference ?? "",
    issuedAt: value.issuedAt ?? "",
    authorityId: typeof value.authorityId === "string" ? value.authorityId : undefined,
    authorityContactId:
      typeof value.authorityContactId === "string" ? value.authorityContactId : undefined,
    attachments: Array.isArray(value.attachments)
      ? value.attachments.map((attachment, attachmentIndex) =>
          normalizeAttachment(attachment, `lda-lookup-${value.id}-${index}-${attachmentIndex}`)
        )
      : undefined,
    aiExtraction: value.aiExtraction ? normalizeAiExtraction(value.aiExtraction) : undefined,
    detailedDescription:
      typeof value.detailedDescription === "string" ? value.detailedDescription : undefined,
    contentSummary: typeof value.contentSummary === "string" ? value.contentSummary : undefined,
    scopeOverride,
    projectTitle: value.projectTitle ?? undefined,
    currentUserCanWriteProject: value.currentUserCanWriteProject,
    archivedAt: value.archivedAt ?? undefined,
    isArchived: Boolean(value.isArchived || value.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeLegalDocLookups(value: unknown): LegalDocLookupState[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((doc, index) => normalizeLegalDocLookup(doc as Partial<LegalDocLookup>, index))
    .filter((doc): doc is LegalDocLookupState => Boolean(doc));
}

function legalDocLookupToStateDoc(value: LegalDocLookupState): LegalDoc {
  return {
    id: value.id,
    projectId: value.projectId,
    type: value.type,
    title: value.title,
    shortDescription: value.shortDescription ?? "",
    detailedDescription: value.detailedDescription,
    contentSummary: value.contentSummary,
    reference: value.reference ?? "",
    issuedAt: value.issuedAt ?? "",
    authorityId: value.authorityId,
    authorityContactId: value.authorityContactId,
    attachments: value.attachments ?? [],
    aiExtraction: value.aiExtraction,
    scopeOverride: value.scopeOverride,
    projectTitle: value.projectTitle,
    currentUserCanWriteProject: Boolean(value.currentUserCanWriteProject),
    archivedAt: value.archivedAt,
    isArchived: value.isArchived,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

const normalizedInitialLegalDocs = normalizeLegalDocs(initialLegalDocs);

function mergeLegalDoc(existing: LegalDoc, incoming: LegalDocLookupState) {
  return {
    ...existing,
    ...incoming,
    shortDescription: incoming.shortDescription ?? existing.shortDescription ?? "",
    detailedDescription:
      incoming.detailedDescription !== undefined
        ? incoming.detailedDescription
        : existing.detailedDescription,
    contentSummary:
      incoming.contentSummary !== undefined ? incoming.contentSummary : existing.contentSummary,
    reference: incoming.reference ?? existing.reference ?? "",
    issuedAt: incoming.issuedAt ?? existing.issuedAt ?? "",
    attachments: incoming.attachments ?? existing.attachments,
    aiExtraction: incoming.aiExtraction ?? existing.aiExtraction,
    scopeOverride: incoming.scopeOverride ?? existing.scopeOverride,
    projectTitle: incoming.projectTitle ?? existing.projectTitle,
    currentUserCanWriteProject:
      incoming.currentUserCanWriteProject ?? existing.currentUserCanWriteProject
  };
}

export function LegalDocsProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const location = useLocation();
  const { logEvent } = useAuditLog();
  const { projects } = useProjects();
  const { getScopeLabel } = useScopes();
  const [legalDocs, setLegalDocs] = useState<LegalDoc[]>([]);
  const [writableProjectOptions, setWritableProjectOptions] = useState<DomainProjectOption[]>([]);
  const authUserRef = useRef(authUser);
  const legalDocLookupInFlightRef = useRef<Map<string, Promise<LegalDoc[]>>>(new Map());
  const shouldAutoLoad = shouldAutoLoadDomainStore(location.pathname, "legalDocs");

  useEffect(() => {
    authUserRef.current = authUser;
    if (!authUser || authUser.type === "EXTERNAL") {
      legalDocLookupInFlightRef.current.clear();
    }
  }, [authUser]);

  const reloadLegalDocs = useCallback(async () => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setLegalDocs([]);
      setWritableProjectOptions([]);
      clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
      return [];
    }

    const [nextLegalDocs, nextProjectOptions] = await Promise.all([
      listLegalDocs(),
      listLegalDocProjectOptions()
    ]);
    const next = normalizeLegalDocs(nextLegalDocs);
    setLegalDocs((prev) => {
      const previousById = new Map(prev.map((doc) => [doc.id, doc] as const));
      return next.map((doc) => {
        const previous = previousById.get(doc.id);
        return {
          ...doc,
          detailedDescription:
            doc.detailedDescription !== undefined
              ? doc.detailedDescription
              : previous?.detailedDescription,
          contentSummary:
            doc.contentSummary !== undefined ? doc.contentSummary : previous?.contentSummary
        };
      });
    });
    setWritableProjectOptions(nextProjectOptions);
    clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
    return next;
  }, [authUser]);

  const loadLegalDocDetail = useCallback(
    async (id: string) => {
      if (!authUser || authUser.type === "EXTERNAL") {
        return null;
      }

      try {
        const legalDoc = normalizeLegalDoc(await apiGetLegalDoc(id), 0);
        if (!legalDoc) {
          return null;
        }

        setLegalDocs((prev) => {
          const exists = prev.some((doc) => doc.id === legalDoc.id);
          return exists
            ? prev.map((doc) => (doc.id === legalDoc.id ? mergeLegalDoc(doc, legalDoc) : doc))
            : [legalDoc, ...prev];
        });
        clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
        return legalDoc;
      } catch {
        return null;
      }
    },
    [authUser]
  );

  const ensureLegalDocLookups = useCallback(
    async (input: { ids?: string[]; projectId?: string }) => {
      if (!authUser || authUser.type === "EXTERNAL") {
        return [];
      }
      const requestUserId = authUser.id;
      const ids = Array.from(new Set((input.ids ?? []).map((id) => id.trim()).filter(Boolean)));
      const projectId = input.projectId?.trim();
      if (ids.length === 0 && !projectId) {
        return [];
      }
      const key = `${requestUserId}:${projectId ?? ""}:${ids.sort().join(",")}`;

      return getOrCreateInFlight(legalDocLookupInFlightRef.current, key, async () => {
        try {
          const next = normalizeLegalDocLookups(await lookupLegalDocs({ ids, projectId }));
          if (authUserRef.current?.id !== requestUserId) {
            return [];
          }

          setLegalDocs((prev) => {
            const previousById = new Map(prev.map((doc) => [doc.id, doc] as const));
            const nextById = new Map(prev.map((doc) => [doc.id, doc] as const));
            next.forEach((doc) => {
              const existing = previousById.get(doc.id);
              nextById.set(
                doc.id,
                existing ? mergeLegalDoc(existing, doc) : legalDocLookupToStateDoc(doc)
              );
            });
            return Array.from(nextById.values());
          });
          clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
          return next.map((doc) => legalDocLookupToStateDoc(doc));
        } catch {
          return [];
        }
      });
    },
    [authUser]
  );

  useEffect(() => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setLegalDocs([]);
      setWritableProjectOptions([]);
      clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
      return;
    }
    if (!shouldAutoLoad) {
      return;
    }

    void reloadLegalDocs().catch(() => {
      setLegalDocs([]);
      setWritableProjectOptions([]);
      clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
    });
  }, [authUser, reloadLegalDocs, shouldAutoLoad]);

  const addLegalDoc = useCallback(
    async (input: LegalDocCreateInput) => {
      try {
        const payload: Parameters<typeof apiCreateLegalDoc>[0] = {
          id: input.id,
          projectId: input.projectId,
          type: input.type,
          title: input.title,
          shortDescription: input.shortDescription ?? "",
          detailedDescription: input.detailedDescription ?? "",
          contentSummary: input.contentSummary ?? "",
          reference: input.reference ?? "",
          issuedAt: input.issuedAt ?? "",
          authorityId: input.authorityId,
          authorityContactId: input.authorityContactId,
          aiExtraction: input.aiExtraction,
          scopeOverride: input.scopeOverride
        };
        if (hasOwnInput(input, "attachments") && Array.isArray(input.attachments)) {
          payload.attachments = input.attachments.map((attachment, index) =>
            normalizeAttachment(attachment, `lda-create-${index}`)
          );
        }

        const createdLegalDoc = normalizeLegalDocs([
          await apiCreateLegalDoc(payload)
        ])[0];

        if (!createdLegalDoc) {
          return null;
        }

        setLegalDocs((prev) => [createdLegalDoc, ...prev]);
        clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "LEGAL_DOC",
          entityId: createdLegalDoc.id,
          action: "CREATED",
          summary: createdLegalDoc.title
        });
        return createdLegalDoc;
      } catch {
        return null;
      }
    },
    [logEvent]
  );

  const updateLegalDoc = useCallback(
    async (id: string, input: Partial<LegalDoc>) => {
      const existing = legalDocs.find((doc) => doc.id === id);
      if (!existing) {
        return null;
      }

      try {
        const payload: Parameters<typeof apiUpdateLegalDoc>[1] = {
          projectId: input.projectId ?? existing.projectId,
          type: input.type ?? existing.type,
          title: input.title ?? existing.title,
          shortDescription:
            input.shortDescription !== undefined
              ? input.shortDescription
              : existing.shortDescription ?? "",
          reference:
            input.reference !== undefined ? input.reference : existing.reference ?? "",
          issuedAt: input.issuedAt !== undefined ? input.issuedAt : existing.issuedAt ?? "",
          authorityId:
            input.authorityId !== undefined ? input.authorityId : existing.authorityId,
          authorityContactId:
            input.authorityContactId !== undefined
              ? input.authorityContactId
              : existing.authorityContactId,
          aiExtraction:
            input.aiExtraction !== undefined ? input.aiExtraction : existing.aiExtraction,
          scopeOverride:
            input.scopeOverride !== undefined ? input.scopeOverride : existing.scopeOverride,
          archivedAt:
            input.archivedAt !== undefined ? input.archivedAt : existing.archivedAt,
          isArchived: input.isArchived !== undefined ? input.isArchived : existing.isArchived
        };

        if (hasOwnInput(input, "detailedDescription") && input.detailedDescription !== undefined) {
          payload.detailedDescription = input.detailedDescription;
        }
        if (hasOwnInput(input, "contentSummary") && input.contentSummary !== undefined) {
          payload.contentSummary = input.contentSummary;
        }
        if (hasOwnInput(input, "attachments") && Array.isArray(input.attachments)) {
          payload.attachments = input.attachments.map((attachment, index) =>
            normalizeAttachment(attachment, `lda-${id}-${index}`)
          );
        }

        const updatedLegalDoc = normalizeLegalDocs([
          await apiUpdateLegalDoc(id, payload)
        ])[0];

        if (!updatedLegalDoc) {
          return null;
        }

        setLegalDocs((prev) =>
          prev.map((doc) => (doc.id === id ? mergeLegalDoc(doc, updatedLegalDoc) : doc))
        );
        clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "LEGAL_DOC",
          entityId: id,
          action: "UPDATED",
          summary: existing.title
        });
        return updatedLegalDoc;
      } catch {
        return null;
      }
    },
    [legalDocs, logEvent]
  );

  const archiveLegalDoc = useCallback(
    async (id: string) => {
      const existing = legalDocs.find((doc) => doc.id === id);
      if (!existing) {
        return null;
      }

      try {
        const updatedLegalDoc = normalizeLegalDocs([await apiArchiveLegalDoc(id)])[0];
        if (!updatedLegalDoc) {
          return null;
        }

        setLegalDocs((prev) =>
          prev.map((doc) => (doc.id === id ? mergeLegalDoc(doc, updatedLegalDoc) : doc))
        );
        clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "LEGAL_DOC",
          entityId: id,
          action: "ARCHIVED",
          summary: existing.title
        });
        return updatedLegalDoc;
      } catch {
        return null;
      }
    },
    [legalDocs, logEvent]
  );

  const restoreLegalDoc = useCallback(
    async (id: string) => {
      const existing = legalDocs.find((doc) => doc.id === id);
      if (!existing) {
        return null;
      }

      try {
        const updatedLegalDoc = normalizeLegalDocs([await apiRestoreLegalDoc(id)])[0];
        if (!updatedLegalDoc) {
          return null;
        }

        setLegalDocs((prev) =>
          prev.map((doc) => (doc.id === id ? mergeLegalDoc(doc, updatedLegalDoc) : doc))
        );
        clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "LEGAL_DOC",
          entityId: id,
          action: "RESTORED",
          summary: existing.title
        });
        return updatedLegalDoc;
      } catch {
        return null;
      }
    },
    [legalDocs, logEvent]
  );

  const addLegalDocAttachment = useCallback(
    async (legalDocId: string, attachment: LegalDocAttachment) => {
      const existing = legalDocs.find((doc) => doc.id === legalDocId);
      if (!existing) {
        return false;
      }

      const nextAttachments = [
        ...existing.attachments,
        normalizeAttachment(attachment, `lda-${legalDocId}-${existing.attachments.length}`)
      ];

      const updated = await updateLegalDoc(legalDocId, { attachments: nextAttachments });
      return Boolean(updated);
    },
    [legalDocs, updateLegalDoc]
  );

  const removeLegalDocAttachment = useCallback(
    async (legalDocId: string, attachmentId: string) => {
      const existing = legalDocs.find((doc) => doc.id === legalDocId);
      if (!existing) {
        return false;
      }

      const updated = await updateLegalDoc(legalDocId, {
        attachments: existing.attachments.filter((item) => item.id !== attachmentId)
      });
      return Boolean(updated);
    },
    [legalDocs, updateLegalDoc]
  );

  const getEffectiveScope = useCallback(
    (legalDoc: LegalDoc) => {
      if (legalDoc.scopeOverride?.companyId) {
        return legalDoc.scopeOverride;
      }
      const project = projects.find((item) => item.id === legalDoc.projectId);
      if (!project) {
        return undefined;
      }
      return {
        companyId: project.companyId,
        siteId: project.siteId,
        facilityId: project.facilityId
      };
    },
    [projects]
  );

  const getEffectiveScopeLabel = useCallback(
    (legalDoc: LegalDoc) => {
      const scope = getEffectiveScope(legalDoc);
      if (!scope) {
        return "";
      }
      return getScopeLabel(scope.companyId, scope.siteId, scope.facilityId);
    },
    [getEffectiveScope, getScopeLabel]
  );

  const getLegalDocsForProject = useCallback(
    (projectId: string) => legalDocs.filter((doc) => doc.projectId === projectId),
    [legalDocs]
  );

  const replaceLegalDocs = useCallback(async (value: LegalDoc[]) => {
    const replaced = normalizeLegalDocs(await bulkReplaceLegalDocs(value));
    setLegalDocs(replaced);
    clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
  }, []);

  const resetLegalDocs = useCallback(async () => {
    if (normalizedInitialLegalDocs.length === 0) {
      await bulkDeleteLegalDocs();
      setLegalDocs([]);
      clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
      return;
    }

    const replaced = normalizeLegalDocs(await bulkReplaceLegalDocs(normalizedInitialLegalDocs));
    setLegalDocs(replaced);
    clearPersistedValue(LEGAL_DOCS_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      legalDocs,
      writableProjectOptions,
      addLegalDoc,
      updateLegalDoc,
      archiveLegalDoc,
      restoreLegalDoc,
      addLegalDocAttachment,
      removeLegalDocAttachment,
      getEffectiveScope,
      getEffectiveScopeForLegalDoc: getEffectiveScope,
      getEffectiveScopeLabel,
      getLegalDocsForProject,
      replaceLegalDocs,
      resetLegalDocs,
      reloadLegalDocs,
      ensureLegalDocLookups,
      loadLegalDocDetail
    }),
    [
      legalDocs,
      writableProjectOptions,
      addLegalDoc,
      updateLegalDoc,
      archiveLegalDoc,
      restoreLegalDoc,
      addLegalDocAttachment,
      removeLegalDocAttachment,
      getEffectiveScope,
      getEffectiveScopeLabel,
      getLegalDocsForProject,
      ensureLegalDocLookups,
      loadLegalDocDetail,
      replaceLegalDocs,
      resetLegalDocs,
      reloadLegalDocs
    ]
  );

  return <LegalDocsContext.Provider value={value}>{children}</LegalDocsContext.Provider>;
}

export function useLegalDocs() {
  const context = useContext(LegalDocsContext);
  if (!context) {
    throw new Error("useLegalDocs must be used within LegalDocsProvider");
  }
  return context;
}
