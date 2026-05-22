import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  listDocuments,
  type DocumentDto,
  type DocumentOwnerType
} from "../api/documents";
import { ApiError } from "../api/client";
import { useAuth } from "./AuthStore";
import { getDocumentOwnerKey } from "./documentOwnerKey";
import {
  applyDocumentOwnerMutations,
  applyPartialDocumentRemove,
  applyPartialDocumentUpsert,
  canApplyDocumentsMutationScope as canApplyDocumentsMutationScopeForOwner,
  clearDocumentMutationReplayForLoad,
  clearDocumentsPendingReplayState,
  consumeDocumentMutationReplayForLoad,
  createDocumentsPendingReplayState,
  createEmptyDocumentsEntry,
  markDocumentsFullLoadPending,
  recordDocumentMutationReplayForPendingLoads,
  type DocumentsEntry,
  type DocumentsMutationScope,
  type DocumentsOwnerMutation
} from "./documentsOwnerEntry";
import {
  canApplyAuthScopedResponse,
  createAuthScopeState,
  getAuthScopedRequestKey,
  getCurrentAuthRequestScope,
  isAuthRequestScopeCurrent,
  syncAuthScopeState
} from "./authScopedRequest";
import { getOrCreateInFlight } from "./inFlightDedupe";

export { getDocumentOwnerKey } from "./documentOwnerKey";
export {
  applyDocumentOwnerMutations,
  applyPartialDocumentRemove,
  applyPartialDocumentUpsert,
  type DocumentsEntry,
  type DocumentsMutationScope,
  type DocumentsOwnerMutation
} from "./documentsOwnerEntry";

type DocumentsEnsureOptions = {
  force?: boolean;
};

type DocumentsContextValue = {
  getDocuments: (ownerType: DocumentOwnerType, ownerId: string) => DocumentDto[];
  ensureDocuments: (
    ownerType: DocumentOwnerType,
    ownerId: string,
    options?: DocumentsEnsureOptions
  ) => Promise<DocumentDto[]>;
  refreshDocuments: (ownerType: DocumentOwnerType, ownerId: string) => Promise<DocumentDto[]>;
  captureDocumentsMutationScope: (
    ownerType: DocumentOwnerType,
    ownerId: string
  ) => DocumentsMutationScope | null;
  canApplyDocumentsMutationScope: (mutationScope: DocumentsMutationScope | null | undefined) => boolean;
  invalidateDocuments: (
    ownerType: DocumentOwnerType,
    ownerId: string,
    mutationScope: DocumentsMutationScope | null | undefined
  ) => boolean;
  upsertDocument: (
    document: DocumentDto,
    mutationScope: DocumentsMutationScope | null | undefined
  ) => boolean;
  upsertDocuments: (
    documents: DocumentDto[],
    mutationScope: DocumentsMutationScope | null | undefined
  ) => boolean;
  removeDocument: (
    ownerType: DocumentOwnerType,
    ownerId: string,
    documentId: string,
    mutationScope: DocumentsMutationScope | null | undefined
  ) => boolean;
  isDocumentsLoaded: (ownerType: DocumentOwnerType, ownerId: string) => boolean;
  isDocumentsLoading: (ownerType: DocumentOwnerType, ownerId: string) => boolean;
  hasDocumentsError: (ownerType: DocumentOwnerType, ownerId: string) => boolean;
  getDocumentsErrorStatus: (ownerType: DocumentOwnerType, ownerId: string) => number | undefined;
};

const DocumentsContext = createContext<DocumentsContextValue | undefined>(undefined);

const EMPTY_DOCUMENTS: DocumentDto[] = [];

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const [entries, setEntries] = useState<Record<string, DocumentsEntry>>({});
  const entriesRef = useRef<Record<string, DocumentsEntry>>({});
  const inFlightRef = useRef<Map<string, Promise<DocumentDto[]>>>(new Map());
  const requestSeqRef = useRef(0);
  const latestRequestSeqByOwnerKeyRef = useRef<Map<string, number>>(new Map());
  const mutationVersionByOwnerKeyRef = useRef<Map<string, number>>(new Map());
  const pendingReplayStateRef = useRef(createDocumentsPendingReplayState());
  const authScopeRef = useRef(createAuthScopeState());

  const setEntriesState = useCallback((value: React.SetStateAction<Record<string, DocumentsEntry>>) => {
    setEntries((prev) => {
      const next = typeof value === "function"
        ? (value as (previous: Record<string, DocumentsEntry>) => Record<string, DocumentsEntry>)(prev)
        : value;
      entriesRef.current = next;
      return next;
    });
  }, []);

  const setOwnerEntry = useCallback((
    ownerKey: string,
    updater: (entry: DocumentsEntry) => DocumentsEntry,
    mutationScope?: DocumentsMutationScope | null
  ) => {
    setEntriesState((prev) => {
      if (
        mutationScope &&
        !canApplyDocumentsMutationScopeForOwner(
          getCurrentAuthRequestScope(authScopeRef.current),
          mutationScope,
          ownerKey
        )
      ) {
        return prev;
      }
      const current = prev[ownerKey] ?? createEmptyDocumentsEntry();
      return {
        ...prev,
        [ownerKey]: updater(current)
      };
    });
  }, [setEntriesState]);

  const canApplyMutationScopeForOwner = useCallback((
    mutationScope: DocumentsMutationScope | null | undefined,
    ownerKey: string
  ) => canApplyDocumentsMutationScopeForOwner(
    getCurrentAuthRequestScope(authScopeRef.current),
    mutationScope,
    ownerKey
  ), []);

  const canApplyCapturedMutationScope = useCallback((
    mutationScope: DocumentsMutationScope | null | undefined
  ) => Boolean(mutationScope && canApplyMutationScopeForOwner(mutationScope, mutationScope.ownerKey)), [
    canApplyMutationScopeForOwner
  ]);

  const recordOwnerMutation = useCallback((
    mutationScope: DocumentsMutationScope,
    mutation: Omit<DocumentsOwnerMutation, "version">
  ) => {
    const ownerKey = mutationScope.ownerKey;
    if (!canApplyMutationScopeForOwner(mutationScope, ownerKey)) {
      return null;
    }
    const version = (mutationVersionByOwnerKeyRef.current.get(ownerKey) ?? 0) + 1;
    mutationVersionByOwnerKeyRef.current.set(ownerKey, version);
    const nextMutation = { ...mutation, version } as DocumentsOwnerMutation;
    recordDocumentMutationReplayForPendingLoads(
      pendingReplayStateRef.current,
      ownerKey,
      mutationScope.authScope,
      nextMutation
    );
    return nextMutation;
  }, [canApplyMutationScopeForOwner]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const clearDocumentUserState = useCallback(() => {
    inFlightRef.current.clear();
    latestRequestSeqByOwnerKeyRef.current.clear();
    mutationVersionByOwnerKeyRef.current.clear();
    clearDocumentsPendingReplayState(pendingReplayStateRef.current);
    setEntriesState({});
  }, [setEntriesState]);

  useLayoutEffect(() => {
    const result = syncAuthScopeState(authScopeRef.current, authUser);
    if (result.shouldClearStore) {
      clearDocumentUserState();
    }
  }, [authUser, clearDocumentUserState]);

  const getDocuments = useCallback((ownerType: DocumentOwnerType, ownerId: string) => {
    const ownerKey = getDocumentOwnerKey(ownerType, ownerId);
    return entriesRef.current[ownerKey]?.items ?? EMPTY_DOCUMENTS;
  }, []);

  const isDocumentsLoading = useCallback((ownerType: DocumentOwnerType, ownerId: string) => {
    const ownerKey = getDocumentOwnerKey(ownerType, ownerId);
    return Boolean(entriesRef.current[ownerKey]?.loading);
  }, []);

  const isDocumentsLoaded = useCallback((ownerType: DocumentOwnerType, ownerId: string) => {
    const ownerKey = getDocumentOwnerKey(ownerType, ownerId);
    const entry = entriesRef.current[ownerKey];
    return Boolean(entry?.loaded && !entry.invalidated);
  }, []);

  const hasDocumentsError = useCallback((ownerType: DocumentOwnerType, ownerId: string) => {
    const ownerKey = getDocumentOwnerKey(ownerType, ownerId);
    return Boolean(entriesRef.current[ownerKey]?.error);
  }, []);

  const getDocumentsErrorStatus = useCallback((ownerType: DocumentOwnerType, ownerId: string) => {
    const ownerKey = getDocumentOwnerKey(ownerType, ownerId);
    return entriesRef.current[ownerKey]?.errorStatus;
  }, []);

  const ensureDocuments = useCallback(async (
    ownerType: DocumentOwnerType,
    ownerId: string,
    options: DocumentsEnsureOptions = {}
  ) => {
    const normalizedOwnerId = ownerId.trim();
    if (!authUser || !normalizedOwnerId) {
      return EMPTY_DOCUMENTS;
    }
    const requestScope = getCurrentAuthRequestScope(authScopeRef.current);
    if (!requestScope || requestScope.userId !== authUser.id) {
      return EMPTY_DOCUMENTS;
    }

    const ownerKey = getDocumentOwnerKey(ownerType, normalizedOwnerId);
    const cached = entriesRef.current[ownerKey];
    if (!options.force && cached?.loaded && !cached.invalidated) {
      return cached.items;
    }

    const inFlightKey = getAuthScopedRequestKey(requestScope, ownerKey);
    const existingRequest = inFlightRef.current.get(inFlightKey);
    if (existingRequest) {
      return existingRequest;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    latestRequestSeqByOwnerKeyRef.current.set(ownerKey, requestSeq);
    markDocumentsFullLoadPending(pendingReplayStateRef.current, ownerKey, requestSeq, requestScope);
    setOwnerEntry(ownerKey, (entry) => ({
      ...entry,
      loading: true,
      error: false,
      errorStatus: undefined
    }));

    return getOrCreateInFlight(inFlightRef.current, inFlightKey, async () => {
      try {
        const items = await listDocuments(ownerType, normalizedOwnerId);
        const latestSeq = latestRequestSeqByOwnerKeyRef.current.get(ownerKey);
        if (!isAuthRequestScopeCurrent(authScopeRef.current, requestScope)) {
          return EMPTY_DOCUMENTS;
        }
        if (canApplyAuthScopedResponse(authScopeRef.current, requestScope, latestSeq, requestSeq)) {
          const replayMutations = consumeDocumentMutationReplayForLoad(
            pendingReplayStateRef.current,
            ownerKey,
            requestSeq,
            requestScope
          );
          const mergedItems = applyDocumentOwnerMutations(
            items,
            replayMutations
          );
          setOwnerEntry(ownerKey, () => ({
            items: mergedItems,
            loaded: true,
            loading: false,
            error: false,
            errorStatus: undefined,
            invalidated: false
          }));
          return mergedItems;
        }
        return entriesRef.current[ownerKey]?.items ?? items;
      } catch (error) {
        const latestSeq = latestRequestSeqByOwnerKeyRef.current.get(ownerKey);
        if (canApplyAuthScopedResponse(authScopeRef.current, requestScope, latestSeq, requestSeq)) {
          setOwnerEntry(ownerKey, (entry) => ({
            ...entry,
            loading: false,
            error: true,
            errorStatus: error instanceof ApiError ? error.status : undefined
          }));
        }
        return entriesRef.current[ownerKey]?.items ?? EMPTY_DOCUMENTS;
      } finally {
        clearDocumentMutationReplayForLoad(pendingReplayStateRef.current, ownerKey, requestSeq);
      }
    });
  }, [authUser, setOwnerEntry]);

  const refreshDocuments = useCallback(
    (ownerType: DocumentOwnerType, ownerId: string) =>
      ensureDocuments(ownerType, ownerId, { force: true }),
    [ensureDocuments]
  );

  const captureDocumentsMutationScope = useCallback((ownerType: DocumentOwnerType, ownerId: string) => {
    const normalizedOwnerId = ownerId.trim();
    if (!authUser || !normalizedOwnerId) {
      return null;
    }
    const authScope = getCurrentAuthRequestScope(authScopeRef.current);
    if (!authScope || authScope.userId !== authUser.id) {
      return null;
    }
    return {
      ownerKey: getDocumentOwnerKey(ownerType, normalizedOwnerId),
      authScope
    };
  }, [authUser]);

  const invalidateDocuments = useCallback((
    ownerType: DocumentOwnerType,
    ownerId: string,
    mutationScope: DocumentsMutationScope | null | undefined
  ) => {
    const ownerKey = getDocumentOwnerKey(ownerType, ownerId.trim());
    if (!canApplyMutationScopeForOwner(mutationScope, ownerKey)) {
      return false;
    }
    setOwnerEntry(ownerKey, (entry) => ({
      ...entry,
      invalidated: true
    }), mutationScope);
    return true;
  }, [canApplyMutationScopeForOwner, setOwnerEntry]);

  const upsertDocument = useCallback((
    document: DocumentDto,
    mutationScope: DocumentsMutationScope | null | undefined
  ) => {
    const ownerKey = getDocumentOwnerKey(document.ownerType, document.ownerId);
    if (!mutationScope || !canApplyMutationScopeForOwner(mutationScope, ownerKey)) {
      return false;
    }
    recordOwnerMutation(mutationScope, { type: "upsert", document });
    setOwnerEntry(ownerKey, (entry) => applyPartialDocumentUpsert(entry, document), mutationScope);
    return true;
  }, [canApplyMutationScopeForOwner, recordOwnerMutation, setOwnerEntry]);

  const upsertDocuments = useCallback((
    documents: DocumentDto[],
    mutationScope: DocumentsMutationScope | null | undefined
  ) => {
    if (!documents.length) {
      return false;
    }
    if (!mutationScope || !canApplyCapturedMutationScope(mutationScope)) {
      return false;
    }

    const scopedDocuments = documents.filter(
      (document) => getDocumentOwnerKey(document.ownerType, document.ownerId) === mutationScope.ownerKey
    );
    if (!scopedDocuments.length) {
      return false;
    }

    scopedDocuments.forEach((document) => {
      recordOwnerMutation(mutationScope, { type: "upsert", document });
    });
    setEntriesState((prev) => {
      if (!canApplyCapturedMutationScope(mutationScope)) {
        return prev;
      }
      const next = { ...prev };
      scopedDocuments.forEach((document) => {
        const ownerKey = getDocumentOwnerKey(document.ownerType, document.ownerId);
        const entry = next[ownerKey] ?? createEmptyDocumentsEntry();
        next[ownerKey] = applyPartialDocumentUpsert(entry, document);
      });
      return next;
    });
    return true;
  }, [canApplyCapturedMutationScope, recordOwnerMutation, setEntriesState]);

  const removeDocument = useCallback((
    ownerType: DocumentOwnerType,
    ownerId: string,
    documentId: string,
    mutationScope: DocumentsMutationScope | null | undefined
  ) => {
    const ownerKey = getDocumentOwnerKey(ownerType, ownerId.trim());
    if (!mutationScope || !canApplyMutationScopeForOwner(mutationScope, ownerKey)) {
      return false;
    }
    recordOwnerMutation(mutationScope, { type: "remove", documentId });
    setOwnerEntry(ownerKey, (entry) => applyPartialDocumentRemove(entry, documentId), mutationScope);
    return true;
  }, [canApplyMutationScopeForOwner, recordOwnerMutation, setOwnerEntry]);

  const value = useMemo(
    () => ({
      getDocuments,
      ensureDocuments,
      refreshDocuments,
      captureDocumentsMutationScope,
      canApplyDocumentsMutationScope: canApplyCapturedMutationScope,
      invalidateDocuments,
      upsertDocument,
      upsertDocuments,
      removeDocument,
      isDocumentsLoaded,
      isDocumentsLoading,
      hasDocumentsError,
      getDocumentsErrorStatus
    }),
    [
      entries,
      captureDocumentsMutationScope,
      canApplyCapturedMutationScope,
      ensureDocuments,
      getDocuments,
      getDocumentsErrorStatus,
      hasDocumentsError,
      invalidateDocuments,
      isDocumentsLoaded,
      isDocumentsLoading,
      refreshDocuments,
      removeDocument,
      upsertDocument,
      upsertDocuments
    ]
  );

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments() {
  const context = useContext(DocumentsContext);
  if (!context) {
    throw new Error("useDocuments must be used within DocumentsProvider");
  }
  return context;
}
