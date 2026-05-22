import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canApplyAuthScopedResponse,
  createAuthScopeState,
  getAuthScopedRequestKey,
  getCurrentAuthRequestScope,
  syncAuthScopeState
} from "./authScopedRequest";

describe("auth scoped request guards", () => {
  it("does not invalidate requests on initial auth hydration", () => {
    const state = createAuthScopeState();
    const result = syncAuthScopeState(state, { id: "user-a" });

    assert.equal(result.transition, "initial-hydration");
    assert.equal(result.shouldClearStore, false);
    assert.deepEqual(getCurrentAuthRequestScope(state), { generation: 0, userId: "user-a" });
  });

  it("invalidates requests on logout and keeps the next login on the new generation", () => {
    const state = createAuthScopeState();
    syncAuthScopeState(state, { id: "user-a" });
    const requestScope = getCurrentAuthRequestScope(state);
    assert.ok(requestScope);

    const logout = syncAuthScopeState(state, null);
    assert.equal(logout.transition, "logout");
    assert.equal(logout.shouldClearStore, true);
    assert.equal(canApplyAuthScopedResponse(state, requestScope, undefined, 1), false);

    const login = syncAuthScopeState(state, { id: "user-b" });
    assert.equal(login.transition, "login-after-logout");
    assert.equal(login.shouldClearStore, false);
    assert.deepEqual(getCurrentAuthRequestScope(state), { generation: 1, userId: "user-b" });
  });

  it("invalidates requests on direct user switch", () => {
    const state = createAuthScopeState();
    syncAuthScopeState(state, { id: "user-a" });
    const requestScope = getCurrentAuthRequestScope(state);
    assert.ok(requestScope);

    const result = syncAuthScopeState(state, { id: "user-b" });

    assert.equal(result.transition, "user-switch");
    assert.equal(result.shouldClearStore, true);
    assert.equal(canApplyAuthScopedResponse(state, requestScope, 1, 1), false);
  });

  it("allows matching responses when latest sequence was cleared but auth scope still matches", () => {
    const state = createAuthScopeState();
    syncAuthScopeState(state, { id: "user-a" });
    const requestScope = getCurrentAuthRequestScope(state);
    assert.ok(requestScope);

    assert.equal(canApplyAuthScopedResponse(state, requestScope, undefined, 1), true);
  });

  it("keeps newer per-key requests authoritative", () => {
    const state = createAuthScopeState();
    syncAuthScopeState(state, { id: "user-a" });
    const requestScope = getCurrentAuthRequestScope(state);
    assert.ok(requestScope);

    assert.equal(canApplyAuthScopedResponse(state, requestScope, 2, 1), false);
    assert.equal(canApplyAuthScopedResponse(state, requestScope, 2, 2), true);
  });

  it("dedupe keys are separated by auth generation and user", () => {
    const state = createAuthScopeState();
    syncAuthScopeState(state, { id: "user-a" });
    const firstScope = getCurrentAuthRequestScope(state);
    assert.ok(firstScope);

    syncAuthScopeState(state, { id: "user-b" });
    const secondScope = getCurrentAuthRequestScope(state);
    assert.ok(secondScope);

    assert.notEqual(
      getAuthScopedRequestKey(firstScope, "PROJECT:project-1"),
      getAuthScopedRequestKey(secondScope, "PROJECT:project-1")
    );
  });
});
