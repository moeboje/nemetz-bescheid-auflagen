import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  LegalDoc,
  LegalDocAiExtraction,
  LegalDocAttachment,
  legalDocs as initialLegalDocs
} from "../data/legalDocs";
import { useAuditLog } from "./AuditLogStore";
import { useProjects } from "./ProjectsStore";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./persistence";
import { useScopes } from "./ScopesStore";
import { normalizeAiAnalysisResult } from "../services/aiResultValidation";

type LegalDocCreateInput = Omit<
  LegalDoc,
  "id" | "createdAt" | "updatedAt" | "isArchived" | "archivedAt" | "attachments"
> & {
  attachments?: LegalDocAttachment[];
};

export type LegalDocsContextValue = {
  legalDocs: LegalDoc[];
  addLegalDoc: (input: LegalDocCreateInput) => LegalDoc;
  updateLegalDoc: (id: string, input: Partial<LegalDoc>) => void;
  archiveLegalDoc: (id: string) => void;
  restoreLegalDoc: (id: string) => void;
  addLegalDocAttachment: (legalDocId: string, attachment: LegalDocAttachment) => void;
  removeLegalDocAttachment: (legalDocId: string, attachmentId: string) => void;
  getEffectiveScope: (legalDoc: LegalDoc) =>
    | { companyId: string; siteId?: string; facilityId?: string }
    | undefined;
  getEffectiveScopeForLegalDoc: (legalDoc: LegalDoc) =>
    | { companyId: string; siteId?: string; facilityId?: string }
    | undefined;
  getEffectiveScopeLabel: (legalDoc: LegalDoc) => string;
  getLegalDocsForProject: (projectId: string) => LegalDoc[];
  replaceLegalDocs: (value: LegalDoc[]) => void;
  resetLegalDocs: () => void;
};

const LegalDocsContext = createContext<LegalDocsContextValue | undefined>(undefined);

function createId(prefix: "ld" | "lda") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function nowStamp() {
  return new Date().toISOString();
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
    reference: value.reference ?? "",
    issuedAt: value.issuedAt ?? "",
    authorityId: typeof value.authorityId === "string" ? value.authorityId : undefined,
    authorityContactId:
      typeof value.authorityContactId === "string" ? value.authorityContactId : undefined,
    attachments,
    aiExtraction: normalizeAiExtraction(value.aiExtraction),
    scopeOverride,
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

export function LegalDocsProvider({ children }: { children: React.ReactNode }) {
  const { logEvent } = useAuditLog();
  const [legalDocs, setLegalDocs] = useState<LegalDoc[]>(() =>
    loadJSON<LegalDoc[]>(STORAGE_KEYS.legalDocs, {
      fallback: initialLegalDocs,
      migrate: (value) => {
        const normalized = normalizeLegalDocs(value);
        return normalized.length ? normalized : initialLegalDocs;
      }
    }) ?? initialLegalDocs
  );
  const { projects } = useProjects();
  const { getScopeLabel } = useScopes();

  React.useEffect(() => {
    saveJSON(STORAGE_KEYS.legalDocs, legalDocs);
  }, [legalDocs]);

  const addLegalDoc = useCallback(
    (input: LegalDocCreateInput) => {
      const timestamp = nowStamp();
      const newDoc: LegalDoc = {
        ...input,
        id: createId("ld"),
        attachments: (input.attachments ?? []).map((attachment, index) =>
          normalizeAttachment(attachment, `lda-${timestamp}-${index}`)
        ),
        aiExtraction: normalizeAiExtraction(input.aiExtraction),
        archivedAt: undefined,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      setLegalDocs((prev) => [newDoc, ...prev]);
      logEvent({
        actorLabel: "Demo User",
        entityType: "LEGAL_DOC",
        entityId: newDoc.id,
        action: "CREATED",
        summary: newDoc.title
      });
      return newDoc;
    },
    [logEvent]
  );

  const updateLegalDoc = useCallback(
    (id: string, input: Partial<LegalDoc>) => {
      const current = legalDocs.find((doc) => doc.id === id);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setLegalDocs((prev) =>
        prev.map((doc) =>
          doc.id === id
            ? {
                ...doc,
                ...input,
                attachments: Array.isArray(input.attachments)
                  ? input.attachments.map((attachment, index) =>
                      normalizeAttachment(attachment, `lda-${id}-${index}`)
                    )
                  : doc.attachments,
                aiExtraction:
                  input.aiExtraction !== undefined
                    ? normalizeAiExtraction(input.aiExtraction)
                    : doc.aiExtraction,
                updatedAt: timestamp
              }
            : doc
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "LEGAL_DOC",
        entityId: id,
        action: "UPDATED",
        summary: current.title
      });
    },
    [legalDocs, logEvent]
  );

  const archiveLegalDoc = useCallback(
    (id: string) => {
      const current = legalDocs.find((doc) => doc.id === id);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setLegalDocs((prev) =>
        prev.map((doc) =>
          doc.id === id
            ? {
                ...doc,
                archivedAt: timestamp,
                isArchived: true,
                updatedAt: timestamp
              }
            : doc
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "LEGAL_DOC",
        entityId: id,
        action: "ARCHIVED",
        summary: current.title
      });
    },
    [legalDocs, logEvent]
  );

  const restoreLegalDoc = useCallback(
    (id: string) => {
      const current = legalDocs.find((doc) => doc.id === id);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setLegalDocs((prev) =>
        prev.map((doc) =>
          doc.id === id
            ? {
                ...doc,
                archivedAt: undefined,
                isArchived: false,
                updatedAt: timestamp
              }
            : doc
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "LEGAL_DOC",
        entityId: id,
        action: "RESTORED",
        summary: current.title
      });
    },
    [legalDocs, logEvent]
  );

  const addLegalDocAttachment = useCallback(
    (legalDocId: string, attachment: LegalDocAttachment) => {
      const current = legalDocs.find((doc) => doc.id === legalDocId);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setLegalDocs((prev) =>
        prev.map((doc) =>
          doc.id === legalDocId
            ? {
                ...doc,
                attachments: [...doc.attachments, normalizeAttachment(attachment, createId("lda"))],
                updatedAt: timestamp
              }
            : doc
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "LEGAL_DOC",
        entityId: legalDocId,
        action: "UPDATED",
        summary: current.title
      });
    },
    [legalDocs, logEvent]
  );

  const removeLegalDocAttachment = useCallback(
    (legalDocId: string, attachmentId: string) => {
      const current = legalDocs.find((doc) => doc.id === legalDocId);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setLegalDocs((prev) =>
        prev.map((doc) =>
          doc.id === legalDocId
            ? {
                ...doc,
                attachments: doc.attachments.filter((item) => item.id !== attachmentId),
                updatedAt: timestamp
              }
            : doc
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "LEGAL_DOC",
        entityId: legalDocId,
        action: "UPDATED",
        summary: current.title
      });
    },
    [legalDocs, logEvent]
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

  const replaceLegalDocs = useCallback((value: LegalDoc[]) => {
    const normalized = normalizeLegalDocs(value);
    setLegalDocs(normalized.length ? normalized : initialLegalDocs);
  }, []);

  const resetLegalDocs = useCallback(() => {
    setLegalDocs(initialLegalDocs);
  }, []);

  const value = useMemo(
    () => ({
      legalDocs,
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
      resetLegalDocs
    }),
    [
      addLegalDoc,
      addLegalDocAttachment,
      archiveLegalDoc,
      getEffectiveScope,
      getEffectiveScopeLabel,
      getLegalDocsForProject,
      legalDocs,
      removeLegalDocAttachment,
      replaceLegalDocs,
      resetLegalDocs,
      restoreLegalDoc,
      updateLegalDoc
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
