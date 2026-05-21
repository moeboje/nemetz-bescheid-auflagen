import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "../data/projects";
import {
  canUseCachedProjectDetail,
  getProjectDetailInFlightKey,
  hasProjectDetailFields,
  mergeProjectListRow
} from "./projectDetailCache";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    title: "Projekt",
    status: "DRAFT",
    shortDescription: "",
    detailedDescription: "Full detail",
    authorityRef: "",
    companyId: "company-1",
    internalParticipants: [],
    participantUserIds: [],
    dependsOnProjectIds: [],
    referenceLegalDocIds: [],
    externalParticipants: [],
    attachments: [],
    isArchived: false,
    createdAt: "2026-05-21T08:00:00.000Z",
    updatedAt: "2026-05-21T08:00:00.000Z",
    ...overrides
  };
}

function leanProject(overrides: Partial<Project> = {}): Project {
  const value = project(overrides);
  delete (value as Partial<Project>).detailedDescription;
  return value;
}

describe("project detail merge semantics", () => {
  it("keeps full detail fields when a newer lean list row arrives", () => {
    const existing = project({
      title: "Cached detail",
      detailedDescription: "User B long text",
      updatedAt: "2026-05-21T08:00:00.000Z"
    });
    const incomingListRow = leanProject({
      title: "Fresh list title",
      updatedAt: "2026-05-21T09:00:00.000Z"
    });

    const merged = mergeProjectListRow(existing, incomingListRow);

    assert.equal(merged.title, "Fresh list title");
    assert.equal(merged.updatedAt, "2026-05-21T09:00:00.000Z");
    assert.equal(merged.detailedDescription, "User B long text");
  });

  it("keeps full detail fields when a newer list row carries an empty detail placeholder", () => {
    const existing = project({
      title: "Cached detail",
      detailedDescription: "Fresh long text",
      updatedAt: "2026-05-21T08:00:00.000Z"
    });
    const incomingListRow = project({
      title: "Fresh list title",
      detailedDescription: "",
      updatedAt: "2026-05-21T09:00:00.000Z"
    });

    const merged = mergeProjectListRow(existing, incomingListRow);

    assert.equal(merged.title, "Fresh list title");
    assert.equal(merged.updatedAt, "2026-05-21T09:00:00.000Z");
    assert.equal(merged.detailedDescription, "Fresh long text");
  });

  it("does not let an older lean list response overwrite newer detail data", () => {
    const existing = project({
      title: "Fresh detail title",
      detailedDescription: "Fresh detail text",
      updatedAt: "2026-05-21T10:00:00.000Z"
    });
    const olderListRow = leanProject({
      title: "Older list title",
      updatedAt: "2026-05-21T09:00:00.000Z"
    });

    const merged = mergeProjectListRow(existing, olderListRow);

    assert.equal(merged.title, "Fresh detail title");
    assert.equal(merged.updatedAt, "2026-05-21T10:00:00.000Z");
    assert.equal(merged.detailedDescription, "Fresh detail text");
  });

  it("uses cached detail only when the loaded version still matches and detail fields exist", () => {
    const fullDetail = project({ updatedAt: "2026-05-21T08:00:00.000Z" });
    const leanDetail = leanProject({ updatedAt: "2026-05-21T08:00:00.000Z" });

    assert.equal(hasProjectDetailFields(fullDetail), true);
    assert.equal(hasProjectDetailFields(leanDetail), false);
    assert.equal(
      canUseCachedProjectDetail(fullDetail, "2026-05-21T08:00:00.000Z", { requireDetail: true }),
      true
    );
    assert.equal(
      canUseCachedProjectDetail(leanDetail, "2026-05-21T08:00:00.000Z", { requireDetail: true }),
      false
    );
    assert.equal(
      canUseCachedProjectDetail(fullDetail, "2026-05-21T07:00:00.000Z", { requireDetail: true }),
      false
    );
    assert.equal(
      canUseCachedProjectDetail(fullDetail, "2026-05-21T08:00:00.000Z", {
        force: true,
        requireDetail: true
      }),
      false
    );
  });

  it("separates forced detail requests from normal detail in-flight requests", () => {
    const scope = { generation: 0, userId: "user-a" };

    assert.equal(
      getProjectDetailInFlightKey(scope, "project-1", { force: true }),
      getProjectDetailInFlightKey(scope, "project-1", { force: true, requireDetail: true })
    );
    assert.notEqual(
      getProjectDetailInFlightKey(scope, "project-1"),
      getProjectDetailInFlightKey(scope, "project-1", { force: true })
    );
    assert.notEqual(
      getProjectDetailInFlightKey(scope, "project-1", { force: true }),
      getProjectDetailInFlightKey(scope, "project-2", { force: true })
    );
  });
});
