import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCascadeArchiveProject,
  countProjectArchiveChildren,
  type ProjectArchiveChildCountSummary,
  type ProjectArchiveChildLoadState
} from "./projectArchiveSummary";

describe("project archive child summary", () => {
  const children: ProjectArchiveChildCountSummary = {
    legalDocs: 1,
    obligations: 1,
    deadlines: 0
  };

  it("counts archive children across project child domains", () => {
    assert.equal(countProjectArchiveChildren(children), 2);
  });

  it("does not allow cascade archive before child counts are fully loaded", () => {
    const unloadedStates: ProjectArchiveChildLoadState[] = ["idle", "loading", "error"];

    unloadedStates.forEach((state) => {
      assert.equal(canCascadeArchiveProject(children, state), false);
    });
  });

  it("allows cascade archive only for loaded non-empty child counts", () => {
    assert.equal(canCascadeArchiveProject(children, "loaded"), true);
    assert.equal(
      canCascadeArchiveProject({ legalDocs: 0, obligations: 0, deadlines: 0 }, "loaded"),
      false
    );
  });
});
