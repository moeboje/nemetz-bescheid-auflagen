import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAdminRoutePath,
  isDashboardRoutePath,
  isProjectDetailRoutePath,
  shouldAutoLoadLookupStore,
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

  it("detects dashboard routes without matching adjacent compliance routes", () => {
    assert.equal(isDashboardRoutePath("/"), true);
    assert.equal(isDashboardRoutePath("/dashboard"), true);
    assert.equal(isDashboardRoutePath("/dashboard/extra"), false);
    assert.equal(isDashboardRoutePath("/compliance"), true);
    assert.equal(isDashboardRoutePath("/compliance/dashboard"), true);
    assert.equal(isDashboardRoutePath("/compliance/dashboard/extra"), false);
    assert.equal(isDashboardRoutePath("/compliance/projects"), false);
  });

  it("suppresses domain autoloads on dashboard routes", () => {
    const routes = ["/", "/dashboard", "/compliance", "/compliance/dashboard"];
    const stores = [
      "projects",
      "legalDocs",
      "obligations",
      "deadlines",
      "taskState",
      "procedureMasterData",
      "users",
      "authorities",
      "scopes"
    ] as const;

    routes.forEach((route) => {
      stores.forEach((store) => {
        assert.equal(shouldAutoLoadDomainStore(route, store), false);
      });
      assert.equal(shouldAutoLoadDomainStore(route), false);
    });
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
    const adminRoutes = [
      "/admin",
      "/admin/",
      "/admin/users",
      "/admin/roles",
      "/admin/external-orgs",
      "/admin/design",
      "/compliance/admin",
      "/compliance/admin/users"
    ];
    const stores = [
      "projects",
      "legalDocs",
      "obligations",
      "deadlines",
      "taskState",
      "procedureMasterData",
      "users",
      "authorities",
      "scopes"
    ] as const;

    adminRoutes.forEach((route) => {
      assert.equal(isAdminRoutePath(route), true);
      assert.equal(shouldAutoLoadDomainStore(route), false);
      stores.forEach((store) => {
        assert.equal(shouldAutoLoadDomainStore(route, store), false);
      });
    });
  });

  it("does not suppress adjacent non-admin route names", () => {
    assert.equal(isAdminRoutePath("/administrator"), false);
    assert.equal(isAdminRoutePath("/compliance/administrator"), false);
    assert.equal(shouldAutoLoadDomainStore("/administrator", "projects"), true);
    assert.equal(shouldAutoLoadDomainStore("/compliance/administrator", "projects"), true);
  });

  it("suppresses eager lookup stores on admin routes only by exact admin segments", () => {
    assert.equal(shouldAutoLoadLookupStore("/admin/users"), false);
    assert.equal(shouldAutoLoadLookupStore("/admin/roles"), false);
    assert.equal(shouldAutoLoadLookupStore("/admin/external-orgs"), false);
    assert.equal(shouldAutoLoadLookupStore("/admin/design"), false);
    assert.equal(shouldAutoLoadLookupStore("/compliance/admin/users"), false);
    assert.equal(shouldAutoLoadLookupStore("/administrator"), true);
    assert.equal(shouldAutoLoadLookupStore("/compliance/administrator"), true);
  });
});
