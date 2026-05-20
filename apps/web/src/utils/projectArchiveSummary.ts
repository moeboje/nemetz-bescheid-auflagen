export type ProjectArchiveChildCountSummary = {
  legalDocs: number;
  obligations: number;
  deadlines: number;
};

export type ProjectArchiveChildLoadState = "idle" | "loading" | "loaded" | "error";

export function countProjectArchiveChildren(summary: ProjectArchiveChildCountSummary) {
  return summary.legalDocs + summary.obligations + summary.deadlines;
}

export function canCascadeArchiveProject(
  summary: ProjectArchiveChildCountSummary,
  loadState: ProjectArchiveChildLoadState
) {
  return loadState === "loaded" && countProjectArchiveChildren(summary) > 0;
}
