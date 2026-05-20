import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canUserLookupExternalOrgs,
  shouldAutoLoadExternalOrgsLookup
} from "./externalOrgsLookupGuards";

describe("external org lookup route guards", () => {
  it("suppresses only eager lookup on project detail routes", () => {
    assert.equal(shouldAutoLoadExternalOrgsLookup("/compliance/projects/project-1"), false);
    assert.equal(shouldAutoLoadExternalOrgsLookup("/projects/project-1"), false);
    assert.equal(shouldAutoLoadExternalOrgsLookup("/compliance/projects"), true);
    assert.equal(shouldAutoLoadExternalOrgsLookup("/compliance/obligations"), true);
  });

  it("keeps explicit lookup permission-gated by existing admin external-org permissions", () => {
    assert.equal(
      canUserLookupExternalOrgs({
        effectivePermissions: ["admin.access", "externalOrgs.view"]
      }),
      true
    );
    assert.equal(
      canUserLookupExternalOrgs({
        effectivePermissions: ["admin.access", "users.manage"]
      }),
      true
    );
    assert.equal(
      canUserLookupExternalOrgs({
        effectivePermissions: ["externalOrgs.view"]
      }),
      false
    );
    assert.equal(canUserLookupExternalOrgs(null), false);
  });
});
