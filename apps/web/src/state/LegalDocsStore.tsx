import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { LegalDoc, LegalDocAttachment, legalDocs as initialLegalDocs } from "../data/legalDocs";
import { useProjects } from "./ProjectsStore";
import { useScopes } from "./ScopesStore";

export type LegalDocsContextValue = {
  legalDocs: LegalDoc[];
  addLegalDoc: (input: Omit<LegalDoc, "id" | "updatedAt" | "attachments"> & { attachments?: LegalDocAttachment[] }) => void;
  updateLegalDoc: (id: string, input: Partial<LegalDoc>) => void;
  addLegalDocAttachment: (legalDocId: string, attachment: LegalDocAttachment) => void;
  removeLegalDocAttachment: (legalDocId: string, attachmentId: string) => void;
  getEffectiveScopeForLegalDoc: (legalDoc: LegalDoc) =>
    | { companyId: string; siteId?: string; facilityId?: string }
    | undefined;
  getEffectiveScopeLabel: (legalDoc: LegalDoc) => string;
};

const LegalDocsContext = createContext<LegalDocsContextValue | undefined>(undefined);

function createId(prefix: "ld" | "lda") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function LegalDocsProvider({ children }: { children: React.ReactNode }) {
  const [legalDocs, setLegalDocs] = useState<LegalDoc[]>(initialLegalDocs);
  const { projects } = useProjects();
  const { getScopeLabel } = useScopes();

  const addLegalDoc = useCallback(
    (input: Omit<LegalDoc, "id" | "updatedAt" | "attachments"> & { attachments?: LegalDocAttachment[] }) => {
      const newDoc: LegalDoc = {
        ...input,
        id: createId("ld"),
        attachments: input.attachments ?? [],
        updatedAt: todayStamp()
      };
      setLegalDocs((prev) => [newDoc, ...prev]);
    },
    []
  );

  const updateLegalDoc = useCallback((id: string, input: Partial<LegalDoc>) => {
    setLegalDocs((prev) =>
      prev.map((doc) =>
        doc.id === id
          ? {
              ...doc,
              ...input,
              updatedAt: todayStamp()
            }
          : doc
      )
    );
  }, []);

  const addLegalDocAttachment = useCallback(
    (legalDocId: string, attachment: LegalDocAttachment) => {
      setLegalDocs((prev) =>
        prev.map((doc) =>
          doc.id === legalDocId
            ? {
                ...doc,
                attachments: [
                  ...doc.attachments,
                  {
                    ...attachment,
                    id: attachment.id || createId("lda")
                  }
                ],
                updatedAt: todayStamp()
              }
            : doc
        )
      );
    },
    []
  );

  const removeLegalDocAttachment = useCallback((legalDocId: string, attachmentId: string) => {
    setLegalDocs((prev) =>
      prev.map((doc) =>
        doc.id === legalDocId
          ? {
              ...doc,
              attachments: doc.attachments.filter((item) => item.id !== attachmentId),
              updatedAt: todayStamp()
            }
          : doc
      )
    );
  }, []);

  const getEffectiveScopeForLegalDoc = useCallback(
    (legalDoc: LegalDoc) => {
      if (legalDoc.scopeOverride) {
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
      const scope = getEffectiveScopeForLegalDoc(legalDoc);
      if (!scope) {
        return "";
      }
      return getScopeLabel(scope.companyId, scope.siteId, scope.facilityId);
    },
    [getEffectiveScopeForLegalDoc, getScopeLabel]
  );

  const value = useMemo(
    () => ({
      legalDocs,
      addLegalDoc,
      updateLegalDoc,
      addLegalDocAttachment,
      removeLegalDocAttachment,
      getEffectiveScopeForLegalDoc,
      getEffectiveScopeLabel
    }),
    [
      addLegalDoc,
      addLegalDocAttachment,
      getEffectiveScopeForLegalDoc,
      getEffectiveScopeLabel,
      legalDocs,
      removeLegalDocAttachment,
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
