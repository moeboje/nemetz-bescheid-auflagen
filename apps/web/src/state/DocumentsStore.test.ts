import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DocumentDto } from "../api/documents";
import {
  applyDocumentOwnerMutations,
  applyPartialDocumentRemove,
  applyPartialDocumentUpsert,
  canApplyDocumentsMutationScope,
  clearDocumentMutationReplayForLoad,
  clearDocumentsPendingReplayState,
  consumeDocumentMutationReplayForLoad,
  createDocumentsPendingReplayState,
  markDocumentsFullLoadPending,
  recordDocumentMutationReplayForPendingLoads,
  type DocumentsEntry,
  type DocumentsMutationScope,
  type DocumentsOwnerMutation
} from "./documentsOwnerEntry";
import { getDocumentOwnerKey } from "./documentOwnerKey";
import {
  createAuthScopeState,
  getCurrentAuthRequestScope,
  syncAuthScopeState
} from "./authScopedRequest";

function entry(overrides: Partial<DocumentsEntry> = {}): DocumentsEntry {
  return {
    items: [],
    loaded: false,
    loading: false,
    error: false,
    errorStatus: undefined,
    invalidated: false,
    ...overrides
  };
}

function document(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: "document-1",
    ownerType: "PROJECT",
    ownerId: "project-1",
    category: "OTHER",
    fileVersion: 1,
    filename: "document-1.pdf",
    originalFilename: "document-1.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    createdAt: "2026-05-18T08:00:00.000Z",
    createdByLabel: "Admin",
    approvalRequired: false,
    approvalStatus: "NOT_REQUIRED",
    ...overrides
  };
}

function mutationScope(ownerKey: string, generation = 0, userId = "user-a"): DocumentsMutationScope {
  return {
    ownerKey,
    authScope: { generation, userId }
  };
}

describe("document owner keys", () => {
  it("keeps owner types and owner ids separated", () => {
    assert.equal(getDocumentOwnerKey("PROJECT", "project-1"), "PROJECT:project-1");
    assert.notEqual(
      getDocumentOwnerKey("PROJECT", "owner-1"),
      getDocumentOwnerKey("LEGAL_DOC", "owner-1")
    );
    assert.notEqual(
      getDocumentOwnerKey("PROJECT", "project-1"),
      getDocumentOwnerKey("PROJECT", "project-2")
    );
  });
});

describe("documents partial mutation semantics", () => {
  it("keeps an unloaded owner unloaded after partial upsert while showing the new document", () => {
    const uploaded = document({ id: "uploaded", createdAt: "2026-05-18T09:00:00.000Z" });
    const next = applyPartialDocumentUpsert(entry(), uploaded);

    assert.equal(next.loaded, false);
    assert.equal(next.invalidated, true);
    assert.deepEqual(next.items.map((item) => item.id), ["uploaded"]);
  });

  it("clears failed state after partial upsert but still requires a full refresh", () => {
    const uploaded = document({ id: "uploaded" });
    const failed = entry({ error: true, errorStatus: 504 });
    const next = applyPartialDocumentUpsert(failed, uploaded);

    assert.equal(next.loaded, false);
    assert.equal(next.error, false);
    assert.equal(next.errorStatus, undefined);
    assert.equal(next.invalidated, true);
  });

  it("merges pending partial mutations into a later full owner list", () => {
    const existing = document({ id: "existing", createdAt: "2026-05-18T08:00:00.000Z" });
    const uploaded = document({ id: "uploaded", createdAt: "2026-05-18T09:00:00.000Z" });
    const mutations: DocumentsOwnerMutation[] = [{ version: 1, type: "upsert", document: uploaded }];
    const merged = applyDocumentOwnerMutations([existing], mutations);

    assert.deepEqual(merged.map((item) => item.id), ["uploaded", "existing"]);
  });

  it("preserves loading during in-flight full list and lets full response merge existing plus upload", () => {
    const uploaded = document({ id: "uploaded", createdAt: "2026-05-18T09:00:00.000Z" });
    const duringLoad = applyPartialDocumentUpsert(entry({ loading: true }), uploaded);

    assert.equal(duringLoad.loaded, false);
    assert.equal(duringLoad.loading, true);

    const existing = document({ id: "existing", createdAt: "2026-05-18T08:00:00.000Z" });
    const merged = applyDocumentOwnerMutations(
      [existing],
      [{ version: 1, type: "upsert", document: uploaded }]
    );

    assert.deepEqual(merged.map((item) => item.id), ["uploaded", "existing"]);
  });

  it("keeps an already loaded owner loaded and deduplicates partial upserts", () => {
    const original = document({ id: "document-1", filename: "old.pdf" });
    const updated = document({ id: "document-1", filename: "new.pdf" });
    const next = applyPartialDocumentUpsert(entry({ items: [original], loaded: true }), updated);

    assert.equal(next.loaded, true);
    assert.equal(next.invalidated, false);
    assert.equal(next.items.length, 1);
    assert.equal(next.items[0]?.filename, "new.pdf");
  });

  it("does not mark an unloaded owner loaded after partial remove", () => {
    const existing = document({ id: "existing" });
    const next = applyPartialDocumentRemove(entry({ items: [existing] }), "existing");

    assert.equal(next.loaded, false);
    assert.equal(next.invalidated, true);
    assert.deepEqual(next.items, []);
  });

  it("applies remove mutations when a full owner list is merged", () => {
    const projectDoc = document({ id: "project-doc", createdAt: "2026-05-18T08:00:00.000Z" });
    const remainingDoc = document({ id: "remaining-doc", createdAt: "2026-05-18T09:00:00.000Z" });
    const merged = applyDocumentOwnerMutations(
      [projectDoc, remainingDoc],
      [{ version: 1, type: "remove", documentId: "project-doc" }]
    );

    assert.deepEqual(merged.map((item) => item.id), ["remaining-doc"]);
  });
});

describe("documents pending full-load mutation replay", () => {
  const ownerKey = getDocumentOwnerKey("PROJECT", "project-1");
  const userAScope = { generation: 0, userId: "user-a" };
  const userBScope = { generation: 1, userId: "user-b" };

  it("lets a later full refresh remove a locally upserted loaded-owner document", () => {
    const replayState = createDocumentsPendingReplayState();
    const existing = document({ id: "existing", createdAt: "2026-05-18T08:00:00.000Z" });
    const uploaded = document({ id: "uploaded", createdAt: "2026-05-18T09:00:00.000Z" });

    const afterLocalUpsert = applyPartialDocumentUpsert(
      entry({ items: [existing], loaded: true }),
      uploaded
    );
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "upsert",
      document: uploaded
    });
    markDocumentsFullLoadPending(replayState, ownerKey, 2, userAScope);
    const replay = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 2, userAScope);
    const refreshed = applyDocumentOwnerMutations([existing], replay);

    assert.equal(afterLocalUpsert.loaded, true);
    assert.deepEqual(afterLocalUpsert.items.map((item) => item.id), ["uploaded", "existing"]);
    assert.deepEqual(replay, []);
    assert.deepEqual(refreshed.map((item) => item.id), ["existing"]);
  });

  it("lets later server data win after a loaded-owner replace", () => {
    const replayState = createDocumentsPendingReplayState();
    const original = document({ id: "document-1", filename: "old.pdf" });
    const localReplacement = document({ id: "document-1", filename: "local.pdf" });
    const serverReplacement = document({ id: "document-1", filename: "server.pdf" });

    const afterLocalReplace = applyPartialDocumentUpsert(
      entry({ items: [original], loaded: true }),
      localReplacement
    );
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "upsert",
      document: localReplacement
    });
    markDocumentsFullLoadPending(replayState, ownerKey, 3, userAScope);
    const replay = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 3, userAScope);
    const refreshed = applyDocumentOwnerMutations([serverReplacement], replay);

    assert.equal(afterLocalReplace.items[0]?.filename, "local.pdf");
    assert.deepEqual(replay, []);
    assert.equal(refreshed[0]?.filename, "server.pdf");
  });

  it("does not keep a loaded-owner delete as a permanent tombstone", () => {
    const replayState = createDocumentsPendingReplayState();
    const serverDocument = document({ id: "document-1" });

    const afterLocalDelete = applyPartialDocumentRemove(
      entry({ items: [serverDocument], loaded: true }),
      "document-1"
    );
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "remove",
      documentId: "document-1"
    });
    markDocumentsFullLoadPending(replayState, ownerKey, 4, userAScope);
    const replay = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 4, userAScope);
    const refreshed = applyDocumentOwnerMutations([serverDocument], replay);

    assert.deepEqual(afterLocalDelete.items, []);
    assert.deepEqual(replay, []);
    assert.deepEqual(refreshed.map((item) => item.id), ["document-1"]);
  });

  it("replays a mutation once for the pending full load that it raced", () => {
    const replayState = createDocumentsPendingReplayState();
    const existing = document({ id: "existing", createdAt: "2026-05-18T08:00:00.000Z" });
    const uploaded = document({ id: "uploaded", createdAt: "2026-05-18T09:00:00.000Z" });

    markDocumentsFullLoadPending(replayState, ownerKey, 10, userAScope);
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "upsert",
      document: uploaded
    });
    const replayA = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 10, userAScope);
    const mergedA = applyDocumentOwnerMutations([existing], replayA);

    markDocumentsFullLoadPending(replayState, ownerKey, 11, userAScope);
    const replayB = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 11, userAScope);
    const mergedB = applyDocumentOwnerMutations([existing], replayB);

    assert.deepEqual(mergedA.map((item) => item.id), ["uploaded", "existing"]);
    assert.deepEqual(consumeDocumentMutationReplayForLoad(replayState, ownerKey, 10, userAScope), []);
    assert.deepEqual(replayB, []);
    assert.deepEqual(mergedB.map((item) => item.id), ["existing"]);
  });

  it("does not replay an unloaded-owner mutation into a later full refresh when no load was pending", () => {
    const replayState = createDocumentsPendingReplayState();
    const uploaded = document({ id: "uploaded", createdAt: "2026-05-18T09:00:00.000Z" });
    const serverDocument = document({ id: "server", createdAt: "2026-05-18T08:00:00.000Z" });

    const afterLocalUpsert = applyPartialDocumentUpsert(entry(), uploaded);
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "upsert",
      document: uploaded
    });
    markDocumentsFullLoadPending(replayState, ownerKey, 20, userAScope);
    const replay = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 20, userAScope);
    const refreshed = applyDocumentOwnerMutations([serverDocument], replay);

    assert.equal(afterLocalUpsert.loaded, false);
    assert.equal(afterLocalUpsert.invalidated, true);
    assert.deepEqual(afterLocalUpsert.items.map((item) => item.id), ["uploaded"]);
    assert.deepEqual(replay, []);
    assert.deepEqual(refreshed.map((item) => item.id), ["server"]);
  });

  it("lets a later full refresh win after failed list plus partial mutation", () => {
    const replayState = createDocumentsPendingReplayState();
    const uploaded = document({ id: "uploaded", createdAt: "2026-05-18T09:00:00.000Z" });
    const serverDocument = document({ id: "server", createdAt: "2026-05-18T08:00:00.000Z" });
    const failed = entry({ error: true, errorStatus: 504 });

    const afterLocalUpsert = applyPartialDocumentUpsert(failed, uploaded);
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "upsert",
      document: uploaded
    });
    markDocumentsFullLoadPending(replayState, ownerKey, 30, userAScope);
    const replay = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 30, userAScope);
    const refreshed = applyDocumentOwnerMutations([serverDocument], replay);

    assert.equal(afterLocalUpsert.loaded, false);
    assert.equal(afterLocalUpsert.error, false);
    assert.equal(afterLocalUpsert.errorStatus, undefined);
    assert.equal(afterLocalUpsert.invalidated, true);
    assert.deepEqual(replay, []);
    assert.deepEqual(refreshed.map((item) => item.id), ["server"]);
  });

  it("clears pending replay on failed loads and auth cleanup", () => {
    const replayState = createDocumentsPendingReplayState();
    const uploaded = document({ id: "uploaded" });

    markDocumentsFullLoadPending(replayState, ownerKey, 40, userAScope);
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "upsert",
      document: uploaded
    });
    clearDocumentMutationReplayForLoad(replayState, ownerKey, 40);
    assert.deepEqual(consumeDocumentMutationReplayForLoad(replayState, ownerKey, 40, userAScope), []);

    markDocumentsFullLoadPending(replayState, ownerKey, 41, userAScope);
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 2,
      type: "upsert",
      document: uploaded
    });
    clearDocumentsPendingReplayState(replayState);
    assert.deepEqual(consumeDocumentMutationReplayForLoad(replayState, ownerKey, 41, userAScope), []);
  });

  it("keeps pending replay scoped to the matching owner key", () => {
    const replayState = createDocumentsPendingReplayState();
    const otherOwnerKey = getDocumentOwnerKey("PROJECT", "project-2");
    const uploaded = document({ id: "uploaded" });

    markDocumentsFullLoadPending(replayState, ownerKey, 50, userAScope);
    markDocumentsFullLoadPending(replayState, otherOwnerKey, 51, userAScope);
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "upsert",
      document: uploaded
    });

    assert.deepEqual(consumeDocumentMutationReplayForLoad(replayState, otherOwnerKey, 51, userAScope), []);
    assert.deepEqual(
      consumeDocumentMutationReplayForLoad(replayState, ownerKey, 50, userAScope).map((mutation) => mutation.type),
      ["upsert"]
    );
  });

  it("ignores upload success after logout before local state or replay can be updated", () => {
    const authState = createAuthScopeState();
    syncAuthScopeState(authState, { id: "user-a" });
    const requestScope = getCurrentAuthRequestScope(authState);
    assert.ok(requestScope);
    const capturedScope = mutationScope(ownerKey, requestScope.generation, requestScope.userId);

    syncAuthScopeState(authState, null);
    const currentScope = getCurrentAuthRequestScope(authState);
    const uploaded = document({ id: "uploaded" });
    const replayState = createDocumentsPendingReplayState();
    let nextEntry = entry();

    if (canApplyDocumentsMutationScope(currentScope, capturedScope, ownerKey)) {
      recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, capturedScope.authScope, {
        version: 1,
        type: "upsert",
        document: uploaded
      });
      nextEntry = applyPartialDocumentUpsert(nextEntry, uploaded);
    }

    assert.equal(canApplyDocumentsMutationScope(currentScope, capturedScope, ownerKey), false);
    assert.deepEqual(nextEntry.items, []);
    assert.equal(replayState.mutationsByOwnerKeyAndLoadId.size, 0);
  });

  it("ignores upload, replace, copy-equivalent upsert, and delete successes after user switch", () => {
    const capturedScope = mutationScope(ownerKey, userAScope.generation, userAScope.userId);
    const currentScope = userBScope;
    const original = document({ id: "document-1", filename: "original.pdf" });
    const uploaded = document({ id: "uploaded", filename: "uploaded.pdf" });
    const replaced = document({ id: "document-1", filename: "replacement.pdf" });
    const copied = document({ id: "copy", filename: "copy.pdf" });
    let nextEntry = entry({ items: [original], loaded: true });

    for (const mutationDocument of [uploaded, replaced, copied]) {
      if (canApplyDocumentsMutationScope(currentScope, capturedScope, ownerKey)) {
        nextEntry = applyPartialDocumentUpsert(nextEntry, mutationDocument);
      }
    }
    if (canApplyDocumentsMutationScope(currentScope, capturedScope, ownerKey)) {
      nextEntry = applyPartialDocumentRemove(nextEntry, "document-1");
    }

    assert.equal(canApplyDocumentsMutationScope(currentScope, capturedScope, ownerKey), false);
    assert.deepEqual(nextEntry.items.map((item) => item.filename), ["original.pdf"]);
  });

  it("does not replay a User-A mutation into a User-B pending full load for the same owner key", () => {
    const replayState = createDocumentsPendingReplayState();
    const uploaded = document({ id: "uploaded" });

    markDocumentsFullLoadPending(replayState, ownerKey, 60, userBScope);
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "upsert",
      document: uploaded
    });

    assert.deepEqual(consumeDocumentMutationReplayForLoad(replayState, ownerKey, 60, userBScope), []);
  });

  it("still applies same-session mutation scopes and same-session one-shot replay", () => {
    const replayState = createDocumentsPendingReplayState();
    const uploaded = document({ id: "uploaded", createdAt: "2026-05-18T09:00:00.000Z" });
    const serverDocument = document({ id: "server", createdAt: "2026-05-18T08:00:00.000Z" });
    const capturedScope = mutationScope(ownerKey, userAScope.generation, userAScope.userId);

    assert.equal(canApplyDocumentsMutationScope(userAScope, capturedScope, ownerKey), true);
    markDocumentsFullLoadPending(replayState, ownerKey, 70, userAScope);
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, capturedScope.authScope, {
      version: 1,
      type: "upsert",
      document: uploaded
    });

    const replayA = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 70, userAScope);
    const mergedA = applyDocumentOwnerMutations([serverDocument], replayA);
    markDocumentsFullLoadPending(replayState, ownerKey, 71, userAScope);
    const replayB = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 71, userAScope);

    assert.deepEqual(mergedA.map((item) => item.id), ["uploaded", "server"]);
    assert.deepEqual(replayB, []);
  });

  it("auth cleanup clears pending replay scopes and mutation metadata", () => {
    const replayState = createDocumentsPendingReplayState();
    const uploaded = document({ id: "uploaded" });

    markDocumentsFullLoadPending(replayState, ownerKey, 80, userAScope);
    recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, userAScope, {
      version: 1,
      type: "upsert",
      document: uploaded
    });
    assert.equal(replayState.pendingLoadIdsByOwnerKey.size, 1);
    assert.equal(replayState.pendingLoadScopesByOwnerKeyAndLoadId.size, 1);
    assert.equal(replayState.mutationsByOwnerKeyAndLoadId.size, 1);

    clearDocumentsPendingReplayState(replayState);

    assert.equal(replayState.pendingLoadIdsByOwnerKey.size, 0);
    assert.equal(replayState.pendingLoadScopesByOwnerKeyAndLoadId.size, 0);
    assert.equal(replayState.mutationsByOwnerKeyAndLoadId.size, 0);
  });
});

describe("documents preview missing auth scopes", () => {
  const ownerKey = getDocumentOwnerKey("PROJECT", "project-1");
  const userAScope = { generation: 0, userId: "user-a" };
  const userBScope = { generation: 1, userId: "user-b" };

  it("allows same-session FILE_MISSING handling to mark the preview document broken", () => {
    const capturedScope = mutationScope(ownerKey, userAScope.generation, userAScope.userId);
    const previewDocument = document({ id: "preview-missing" });
    const brokenIds = new Set<string>();

    if (canApplyDocumentsMutationScope(userAScope, capturedScope, ownerKey)) {
      brokenIds.add(previewDocument.id);
    }

    assert.deepEqual([...brokenIds], ["preview-missing"]);
  });

  it("allows same-session DOCUMENT_NOT_FOUND handling to remove and replay the missing document", () => {
    const replayState = createDocumentsPendingReplayState();
    const capturedScope = mutationScope(ownerKey, userAScope.generation, userAScope.userId);
    const missingDocument = document({ id: "missing-document" });
    let nextEntry = entry({ items: [missingDocument], loaded: true });

    markDocumentsFullLoadPending(replayState, ownerKey, 90, userAScope);
    if (canApplyDocumentsMutationScope(userAScope, capturedScope, ownerKey)) {
      recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, capturedScope.authScope, {
        version: 1,
        type: "remove",
        documentId: missingDocument.id
      });
      nextEntry = applyPartialDocumentRemove(nextEntry, missingDocument.id);
    }

    const replay = consumeDocumentMutationReplayForLoad(replayState, ownerKey, 90, userAScope);
    assert.deepEqual(nextEntry.items, []);
    assert.deepEqual(replay, [{ version: 1, type: "remove", documentId: "missing-document" }]);
  });

  it("ignores old-session FILE_MISSING preview callbacks after a user switch", () => {
    const capturedScope = mutationScope(ownerKey, userAScope.generation, userAScope.userId);
    const previewDocument = document({ id: "old-preview-missing" });
    const brokenIds = new Set<string>();

    if (canApplyDocumentsMutationScope(userBScope, capturedScope, ownerKey)) {
      brokenIds.add(previewDocument.id);
    }

    assert.equal(canApplyDocumentsMutationScope(userBScope, capturedScope, ownerKey), false);
    assert.deepEqual([...brokenIds], []);
  });

  it("ignores old-session DOCUMENT_NOT_FOUND remove handling after a user switch", () => {
    const replayState = createDocumentsPendingReplayState();
    const capturedScope = mutationScope(ownerKey, userAScope.generation, userAScope.userId);
    const existingDocument = document({ id: "document-1", filename: "user-b.pdf" });
    let nextEntry = entry({ items: [existingDocument], loaded: true });

    markDocumentsFullLoadPending(replayState, ownerKey, 91, userBScope);
    if (canApplyDocumentsMutationScope(userBScope, capturedScope, ownerKey)) {
      recordDocumentMutationReplayForPendingLoads(replayState, ownerKey, capturedScope.authScope, {
        version: 1,
        type: "remove",
        documentId: existingDocument.id
      });
      nextEntry = applyPartialDocumentRemove(nextEntry, existingDocument.id);
    }

    assert.equal(canApplyDocumentsMutationScope(userBScope, capturedScope, ownerKey), false);
    assert.deepEqual(nextEntry.items.map((item) => item.filename), ["user-b.pdf"]);
    assert.deepEqual(consumeDocumentMutationReplayForLoad(replayState, ownerKey, 91, userBScope), []);
  });
});
