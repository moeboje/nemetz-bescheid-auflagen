import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEntraStateStore, extractEmailFromClaims, isAllowedEmailDomain } from "./entra.js";

describe("Entra helpers", () => {
  it("maps claims to normalized email", () => {
    assert.equal(extractEmailFromClaims({ email: "User@Example.com " }), "user@example.com");
    assert.equal(extractEmailFromClaims({ preferred_username: "Alt@Example.com" }), "alt@example.com");
    assert.equal(extractEmailFromClaims({ upn: "Third@Example.com" }), "third@example.com");
    assert.equal(extractEmailFromClaims({ name: "No Email" }), null);
  });

  it("checks allowlisted domains", () => {
    assert.equal(isAllowedEmailDomain("user@nemetz-ag.at", ["nemetz-ag.at"]), true);
    assert.equal(isAllowedEmailDomain("user@other.com", ["nemetz-ag.at"]), false);
    assert.equal(isAllowedEmailDomain("user@other.com", []), true);
  });

  it("validates state once and rejects reused state", () => {
    const store = createEntraStateStore();
    const { state } = store.issueState();

    const firstUse = store.consumeState(state);
    assert.ok(firstUse, "state should be valid the first time");

    const secondUse = store.consumeState(state);
    assert.equal(secondUse, null, "state should be invalid after consumption");
  });
});
