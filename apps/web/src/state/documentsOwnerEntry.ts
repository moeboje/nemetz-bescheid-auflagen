import type { DocumentDto } from "../api/documents";
import type { AuthRequestScope } from "./authScopedRequest";

export type DocumentsEntry = {
  items: DocumentDto[];
  loaded: boolean;
  loading: boolean;
  error: boolean;
  errorStatus?: number;
  invalidated: boolean;
};

export type DocumentsOwnerMutation =
  | { version: number; type: "upsert"; document: DocumentDto }
  | { version: number; type: "remove"; documentId: string };

export type DocumentsPendingReplayState = {
  pendingLoadIdsByOwnerKey: Map<string, Set<number>>;
  pendingLoadScopesByOwnerKeyAndLoadId: Map<string, AuthRequestScope>;
  mutationsByOwnerKeyAndLoadId: Map<string, DocumentsOwnerMutation[]>;
};

export type DocumentsMutationScope = {
  ownerKey: string;
  authScope: AuthRequestScope;
};

export function createEmptyDocumentsEntry(): DocumentsEntry {
  return {
    items: [],
    loaded: false,
    loading: false,
    error: false,
    errorStatus: undefined,
    invalidated: false
  };
}

export function createDocumentsPendingReplayState(): DocumentsPendingReplayState {
  return {
    pendingLoadIdsByOwnerKey: new Map(),
    pendingLoadScopesByOwnerKeyAndLoadId: new Map(),
    mutationsByOwnerKeyAndLoadId: new Map()
  };
}

function getReplayKey(ownerKey: string, loadId: number) {
  return `${ownerKey}:${loadId}`;
}

function hasSameAuthScope(left: AuthRequestScope, right: AuthRequestScope) {
  return left.generation === right.generation && left.userId === right.userId;
}

export function canApplyDocumentsMutationScope(
  currentAuthScope: AuthRequestScope | null,
  mutationScope: DocumentsMutationScope | null | undefined,
  ownerKey: string
) {
  return Boolean(
    currentAuthScope &&
      mutationScope &&
      mutationScope.ownerKey === ownerKey &&
      hasSameAuthScope(currentAuthScope, mutationScope.authScope)
  );
}

export function markDocumentsFullLoadPending(
  state: DocumentsPendingReplayState,
  ownerKey: string,
  loadId: number,
  authScope: AuthRequestScope
) {
  const pendingLoadIds = state.pendingLoadIdsByOwnerKey.get(ownerKey) ?? new Set<number>();
  pendingLoadIds.add(loadId);
  state.pendingLoadIdsByOwnerKey.set(ownerKey, pendingLoadIds);
  state.pendingLoadScopesByOwnerKeyAndLoadId.set(getReplayKey(ownerKey, loadId), authScope);
}

export function recordDocumentMutationReplayForPendingLoads(
  state: DocumentsPendingReplayState,
  ownerKey: string,
  authScope: AuthRequestScope,
  mutation: DocumentsOwnerMutation
) {
  const pendingLoadIds = state.pendingLoadIdsByOwnerKey.get(ownerKey);
  if (!pendingLoadIds?.size) {
    return;
  }

  pendingLoadIds.forEach((loadId) => {
    const replayKey = getReplayKey(ownerKey, loadId);
    const pendingLoadScope = state.pendingLoadScopesByOwnerKeyAndLoadId.get(replayKey);
    if (!pendingLoadScope || !hasSameAuthScope(pendingLoadScope, authScope)) {
      return;
    }
    const previousMutations = state.mutationsByOwnerKeyAndLoadId.get(replayKey) ?? [];
    state.mutationsByOwnerKeyAndLoadId.set(replayKey, [...previousMutations, mutation].slice(-100));
  });
}

export function clearDocumentMutationReplayForLoad(
  state: DocumentsPendingReplayState,
  ownerKey: string,
  loadId: number
) {
  const pendingLoadIds = state.pendingLoadIdsByOwnerKey.get(ownerKey);
  if (pendingLoadIds) {
    pendingLoadIds.delete(loadId);
    if (!pendingLoadIds.size) {
      state.pendingLoadIdsByOwnerKey.delete(ownerKey);
    }
  }
  state.pendingLoadScopesByOwnerKeyAndLoadId.delete(getReplayKey(ownerKey, loadId));
  state.mutationsByOwnerKeyAndLoadId.delete(getReplayKey(ownerKey, loadId));
}

export function consumeDocumentMutationReplayForLoad(
  state: DocumentsPendingReplayState,
  ownerKey: string,
  loadId: number,
  authScope: AuthRequestScope
) {
  const replayKey = getReplayKey(ownerKey, loadId);
  const pendingLoadScope = state.pendingLoadScopesByOwnerKeyAndLoadId.get(replayKey);
  const mutations = pendingLoadScope && hasSameAuthScope(pendingLoadScope, authScope)
    ? state.mutationsByOwnerKeyAndLoadId.get(replayKey) ?? []
    : [];
  clearDocumentMutationReplayForLoad(state, ownerKey, loadId);
  return mutations;
}

export function clearDocumentsPendingReplayState(state: DocumentsPendingReplayState) {
  state.pendingLoadIdsByOwnerKey.clear();
  state.pendingLoadScopesByOwnerKeyAndLoadId.clear();
  state.mutationsByOwnerKeyAndLoadId.clear();
}

function sortDocuments(items: DocumentDto[]) {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function upsertDocumentIntoItems(items: DocumentDto[], document: DocumentDto) {
  const exists = items.some((item) => item.id === document.id);
  const next = exists
    ? items.map((item) => (item.id === document.id ? document : item))
    : [document, ...items];
  return sortDocuments(next);
}

function removeDocumentFromItems(items: DocumentDto[], documentId: string) {
  return items.filter((item) => item.id !== documentId);
}

export function applyDocumentOwnerMutations(
  items: DocumentDto[],
  mutations: DocumentsOwnerMutation[]
) {
  return mutations.reduce((nextItems, mutation) => {
    if (mutation.type === "upsert") {
      return upsertDocumentIntoItems(nextItems, mutation.document);
    }
    return removeDocumentFromItems(nextItems, mutation.documentId);
  }, sortDocuments(items));
}

export function applyPartialDocumentUpsert(entry: DocumentsEntry, document: DocumentDto): DocumentsEntry {
  return {
    ...entry,
    items: upsertDocumentIntoItems(entry.items, document),
    loaded: entry.loaded,
    loading: entry.loading,
    error: false,
    errorStatus: undefined,
    invalidated: entry.loaded ? entry.invalidated : true
  };
}

export function applyPartialDocumentRemove(entry: DocumentsEntry, documentId: string): DocumentsEntry {
  return {
    ...entry,
    items: removeDocumentFromItems(entry.items, documentId),
    loaded: entry.loaded,
    loading: entry.loading,
    error: false,
    errorStatus: undefined,
    invalidated: entry.loaded ? entry.invalidated : true
  };
}
