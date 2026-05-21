import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canApplyListRequest,
  createListRequestState,
  getOrStartListRequest,
  invalidateListRequests
} from "./listRequestGuard";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("list request guard", () => {
  it("dedupes normal parallel admin list fetches by query key", async () => {
    const state = createListRequestState<string>();
    let calls = 0;

    const first = getOrStartListRequest(state, "users:q=Test&page=1", async () => {
      calls += 1;
      return "users";
    });
    const second = getOrStartListRequest(state, "users:q=Test&page=1", async () => {
      calls += 1;
      return "users-duplicate";
    });

    assert.equal(first, second);
    assert.equal(await first.promise, "users");
    assert.equal(calls, 1);
  });

  it("keeps different admin list query keys separated", async () => {
    const state = createListRequestState<string>();
    let calls = 0;

    const first = getOrStartListRequest(state, "roles:q=A", async () => {
      calls += 1;
      return "a";
    });
    const second = getOrStartListRequest(state, "roles:q=B", async () => {
      calls += 1;
      return "b";
    });

    assert.notEqual(first, second);
    assert.deepEqual(await Promise.all([first.promise, second.promise]), ["a", "b"]);
    assert.equal(calls, 2);
  });

  it("starts a fresh post-mutation request instead of reusing an old users in-flight list", async () => {
    const state = createListRequestState<string>();
    const oldRequest = deferred<string>();
    const freshRequest = deferred<string>();
    let calls = 0;

    const beforeMutation = getOrStartListRequest(state, "users:q=Test&page=1", async () => {
      calls += 1;
      return oldRequest.promise;
    });

    invalidateListRequests(state);

    const afterMutation = getOrStartListRequest(
      state,
      "users:q=Test&page=1",
      async () => {
        calls += 1;
        return freshRequest.promise;
      },
      { force: true, reason: "postMutation" }
    );

    assert.notEqual(beforeMutation, afterMutation);

    oldRequest.resolve("old-users");
    freshRequest.resolve("fresh-users");

    assert.equal(await beforeMutation.promise, "old-users");
    assert.equal(await afterMutation.promise, "fresh-users");
    assert.equal(canApplyListRequest(state, beforeMutation), false);
    assert.equal(canApplyListRequest(state, afterMutation), true);
    assert.equal(calls, 2);
  });

  it("lets newer roles requests win when old and fresh requests resolve out of order", async () => {
    const state = createListRequestState<string>();
    const oldRequest = deferred<string>();
    const freshRequest = deferred<string>();

    const beforeMutation = getOrStartListRequest(state, "roles:q=Phase", () => oldRequest.promise);
    invalidateListRequests(state);
    const afterMutation = getOrStartListRequest(
      state,
      "roles:q=Phase",
      () => freshRequest.promise,
      { force: true, reason: "postMutation" }
    );

    freshRequest.resolve("fresh-roles");
    assert.equal(await afterMutation.promise, "fresh-roles");
    assert.equal(canApplyListRequest(state, afterMutation), true);

    oldRequest.resolve("old-roles");
    assert.equal(await beforeMutation.promise, "old-roles");
    assert.equal(canApplyListRequest(state, beforeMutation), false);
  });

  it("blocks stale external-org lookup responses after mutation invalidation", async () => {
    const state = createListRequestState<string[]>();
    const oldRequest = deferred<string[]>();

    const beforeMutation = getOrStartListRequest(state, "external-orgs:lookup", () => oldRequest.promise);
    invalidateListRequests(state);
    oldRequest.resolve(["old external org"]);

    assert.deepEqual(await beforeMutation.promise, ["old external org"]);
    assert.equal(canApplyListRequest(state, beforeMutation), false);
  });

  it("does not invalidate requests when a mutation fails before success handling", async () => {
    const state = createListRequestState<string>();
    const request = getOrStartListRequest(state, "authorities:lookup", async () => "authorities");

    await assert.rejects(async () => {
      throw new Error("mutation failed");
    });

    assert.equal(await request.promise, "authorities");
    assert.equal(canApplyListRequest(state, request), true);
  });
});
