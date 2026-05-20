import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAdminRoutePath,
  isProjectDetailRoutePath,
  shouldAutoLoadDomainStore
} from "./routeLoading";

describe("route loading guards", () => {
  it("does not treat administrator lookalikes as admin routes", () => {
    assert.equal(isAdminRoutePath("/administrator"), false);
    assert.equal(isAdminRoutePath("/compliance/administrator"), false);
  });

  it("detects project detail routes under module and legacy prefixes", () => {
    assert.equal(isProjectDetailRoutePath("/projects/project-1"), true);
    assert.equal(isProjectDetailRoutePath("/compliance/projects/project-1"), true);
    assert.equal(isProjectDetailRoutePath("/compliance/projects"), false);
  });

  it("suppresses heavy domain autoloads on project detail routes", () => {
    const route = "/compliance/projects/project-1";

    assert.equal(shouldAutoLoadDomainStore(route, "projects"), false);
    assert.equal(shouldAutoLoadDomainStore(route, "legalDocs"), false);
    assert.equal(shouldAutoLoadDomainStore(route, "obligations"), false);
    assert.equal(shouldAutoLoadDomainStore(route, "deadlines"), false);
    assert.equal(shouldAutoLoadDomainStore(route, "taskState"), false);
    assert.equal(shouldAutoLoadDomainStore(route, "procedureMasterData"), false);
    assert.equal(shouldAutoLoadDomainStore(route), false);
  });

  it("keeps visible project header lookups available on project detail routes", () => {
    const route = "/compliance/projects/project-1";

    assert.equal(shouldAutoLoadDomainStore(route, "scopes"), true);
    assert.equal(shouldAutoLoadDomainStore(route, "authorities"), true);
    assert.equal(shouldAutoLoadDomainStore(route, "users"), true);
  });

  it("does not autoload domain stores on real admin routes", () => {
    assert.equal(shouldAutoLoadDomainStore("/admin", "projects"), false);
    assert.equal(shouldAutoLoadDomainStore("/compliance/admin/users", "users"), false);
  });
});
