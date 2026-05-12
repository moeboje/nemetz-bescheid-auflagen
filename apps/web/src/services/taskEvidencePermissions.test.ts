import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canUploadTaskEvidence } from "./taskEvidencePermissions";

describe("task evidence upload permissions", () => {
  it("allows deadline evidence upload with deadlines.edit and project write", () => {
    assert.equal(
      canUploadTaskEvidence({
        ownerType: "DEADLINE",
        projectCanWrite: true,
        canCompleteTasks: false,
        canEditDeadlines: true,
        isExternal: false
      }),
      true
    );
  });

  it("allows deadline evidence upload with tasks.complete and project write", () => {
    assert.equal(
      canUploadTaskEvidence({
        ownerType: "DEADLINE",
        projectCanWrite: true,
        canCompleteTasks: true,
        canEditDeadlines: false,
        isExternal: false
      }),
      true
    );
  });

  it("blocks deadline evidence upload without deadline edit or task completion permission", () => {
    assert.equal(
      canUploadTaskEvidence({
        ownerType: "DEADLINE",
        projectCanWrite: true,
        canCompleteTasks: false,
        canEditDeadlines: false,
        isExternal: false
      }),
      false
    );
  });

  it("keeps TASK_EVIDENCE upload tied to tasks.complete", () => {
    assert.equal(
      canUploadTaskEvidence({
        ownerType: "TASK_EVIDENCE",
        projectCanWrite: true,
        canCompleteTasks: false,
        canEditDeadlines: true,
        isExternal: false
      }),
      false
    );
  });

  it("blocks upload without project write or for external users", () => {
    assert.equal(
      canUploadTaskEvidence({
        ownerType: "DEADLINE",
        projectCanWrite: false,
        canCompleteTasks: true,
        canEditDeadlines: true,
        isExternal: false
      }),
      false
    );
    assert.equal(
      canUploadTaskEvidence({
        ownerType: "DEADLINE",
        projectCanWrite: true,
        canCompleteTasks: true,
        canEditDeadlines: true,
        isExternal: true
      }),
      false
    );
  });
});
