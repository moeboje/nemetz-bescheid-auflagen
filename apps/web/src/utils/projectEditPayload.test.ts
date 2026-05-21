import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "../data/projects";
import {
  hasProjectDetailedDescription,
  shouldSendProjectDetailedDescription
} from "./projectEditPayload";

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

describe("project edit payload detail guards", () => {
  it("does not send missing edit detail fields from lean list rows", () => {
    const lean = leanProject();

    assert.equal(hasProjectDetailedDescription(lean), false);
    assert.equal(
      shouldSendProjectDetailedDescription({
        mode: "edit",
        project: lean,
        initialDetailedDescription: undefined,
        currentDetailedDescription: ""
      }),
      false
    );
  });

  it("omits unchanged edit detail descriptions", () => {
    const full = project({ detailedDescription: "Alt" });

    assert.equal(hasProjectDetailedDescription(full), true);
    assert.equal(
      shouldSendProjectDetailedDescription({
        mode: "edit",
        project: full,
        initialDetailedDescription: "Alt",
        currentDetailedDescription: "Alt"
      }),
      false
    );
  });

  it("sends changed edit detail descriptions", () => {
    const full = project({ detailedDescription: "Alt" });

    assert.equal(
      shouldSendProjectDetailedDescription({
        mode: "edit",
        project: full,
        initialDetailedDescription: "Alt",
        currentDetailedDescription: "Neu"
      }),
      true
    );
  });

  it("allows an intentional clear when the edit modal has full detail", () => {
    const full = project({ detailedDescription: "Text" });

    assert.equal(
      shouldSendProjectDetailedDescription({
        mode: "edit",
        project: full,
        initialDetailedDescription: "Text",
        currentDetailedDescription: ""
      }),
      true
    );
  });

  it("keeps create payloads allowed to include filled and empty detail descriptions", () => {
    assert.equal(
      shouldSendProjectDetailedDescription({
        mode: "create",
        currentDetailedDescription: "Neues Projekt"
      }),
      true
    );
    assert.equal(
      shouldSendProjectDetailedDescription({
        mode: "create",
        currentDetailedDescription: ""
      }),
      true
    );
  });
});
