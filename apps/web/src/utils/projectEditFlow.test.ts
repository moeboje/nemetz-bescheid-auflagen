import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "../data/projects";
import { loadFreshProjectForEdit } from "./projectEditFlow";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    title: "Projekt",
    status: "DRAFT",
    shortDescription: "",
    detailedDescription: "Fresh detail",
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
    updatedAt: "2026-05-21T09:00:00.000Z",
    ...overrides
  };
}

describe("project edit fresh detail flow", () => {
  it("refreshes project list metadata before force-loading full project detail", async () => {
    const calls: string[] = [];
    const freshDetail = project();

    const detail = await loadFreshProjectForEdit({
      projectId: "project-1",
      reloadProjects: async () => {
        calls.push("reloadProjects");
        return [];
      },
      ensureProject: async (projectId, options) => {
        calls.push(
          `ensureProject:${projectId}:${String(options.force)}:${String(options.requireDetail)}`
        );
        return freshDetail;
      }
    });

    assert.equal(detail, freshDetail);
    assert.deepEqual(calls, ["reloadProjects", "ensureProject:project-1:true:true"]);
  });
});
