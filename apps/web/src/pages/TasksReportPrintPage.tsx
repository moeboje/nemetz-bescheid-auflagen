import React, { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card } from "@nemetz/ui";
import { useLocation } from "react-router-dom";
import { getUserDisplayName } from "../data/users";
import { t } from "../i18n";
import { buildPages } from "../services/reportPagination";
import { useAuthorization } from "../state/AuthorizationStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { type Task, useTasks } from "../state/TasksStore";
import { useUsers } from "../state/UsersStore";

type DueRangeFilter = "all" | "30" | "overdue";

type ReportTaskRow = {
  id: string;
  dueDate: string;
  assignee: string;
  title: string;
  shortDescription: string;
  contextLines: string[];
  scope: string;
  isOverdue: boolean;
};

const SHORT_DESCRIPTION_MAX_CHARS = 140;
const CONTEXT_LINE_MAX_CHARS = 90;
const SCOPE_MAX_CHARS = 90;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateStamp(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTimeStamp(date: Date) {
  return `${formatDateStamp(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isDueOverdue(dueDate: string, todayISO: string) {
  return Boolean(dueDate) && dueDate < todayISO;
}

function normalizeDueRange(value: string): DueRangeFilter {
  if (value === "30") {
    return "30";
  }
  if (value === "overdue") {
    return "overdue";
  }
  return "all";
}

function readQueryParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value?.trim() ?? "";
}

function normalizeText(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxChars: number) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function getAssigneeLabel(task: Task, getUserLabel: (userId?: string) => string, dash: string) {
  if (task.assignedToLabel && task.assignedToLabel.trim()) {
    return task.assignedToLabel;
  }
  if (task.assignedTo && task.assignedTo.trim()) {
    return task.assignedTo;
  }
  if (task.assignedToUserId) {
    const fromUser = getUserLabel(task.assignedToUserId);
    if (fromUser.trim()) {
      return fromUser;
    }
  }
  return dash;
}

async function waitForReportAssets(root: HTMLElement) {
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) {
        return Promise.resolve();
      }
      if (img.complete && img.naturalWidth === 0) {
        // Broken image already resolved by browser, don't block print.
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    })
  );

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export default function TasksReportPrintPage() {
  const location = useLocation();
  const { actor } = useAuthorization();
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { legalDocs } = useLegalDocs();
  const { obligations } = useObligations();
  const { deadlines } = useDeadlines();
  const { getScopeLabel } = useScopes();
  const { currentUser, getUserLabel } = useUsers();

  const generatedAt = useMemo(() => new Date(), []);
  const todayISO = formatDateStamp(generatedAt);
  const fileTitle = `Aufgabenreport_Offene-Aufgaben_${todayISO}`;
  const logoSrc = `${import.meta.env.BASE_URL}brand/nemetz-logo.png?v=1`;
  const [logoError, setLogoError] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = fileTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [fileTitle]);

  const dueSoonLimit = useMemo(() => {
    const limit = new Date(`${todayISO}T00:00:00`);
    limit.setDate(limit.getDate() + 30);
    return formatDateStamp(limit);
  }, [todayISO]);

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const scopeCompanyId = readQueryParam(params, "scopeCompanyId");
  const scopeSiteId = readQueryParam(params, "scopeSiteId");
  const scopeFacilityId = readQueryParam(params, "scopeFacilityId");
  const assigneeId = readQueryParam(params, "assigneeId");
  const dueRange = normalizeDueRange(readQueryParam(params, "dueRange") || "all");

  const scopeLabelFilter = useMemo(() => {
    if (!scopeCompanyId) {
      return "";
    }
    return getScopeLabel(scopeCompanyId, scopeSiteId || undefined, scopeFacilityId || undefined);
  }, [getScopeLabel, scopeCompanyId, scopeFacilityId, scopeSiteId]);

  const dash = t("common.dash");

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects]
  );
  const legalDocById = useMemo(
    () => new Map(legalDocs.map((legalDoc) => [legalDoc.id, legalDoc] as const)),
    [legalDocs]
  );
  const obligationById = useMemo(
    () => new Map(obligations.map((obligation) => [obligation.id, obligation] as const)),
    [obligations]
  );
  const deadlineById = useMemo(
    () => new Map(deadlines.map((deadline) => [deadline.id, deadline] as const)),
    [deadlines]
  );

  const rows = useMemo<ReportTaskRow[]>(() => {
    const getTaskReferences = (task: Task) => {
      const project = task.projectId ? projectById.get(task.projectId) : undefined;
      const legalDoc = task.legalDocId ? legalDocById.get(task.legalDocId) : undefined;
      const obligation = task.obligationId ? obligationById.get(task.obligationId) : undefined;
      const deadline = task.deadlineId ? deadlineById.get(task.deadlineId) : undefined;
      return { project, legalDoc, obligation, deadline };
    };

    const getTaskScopeLabel = (
      task: Task,
      refs: ReturnType<typeof getTaskReferences>
    ) => {
      const scopedTask = task as Task & {
        scopeCompanyId?: string;
        scopeSiteId?: string;
        scopeFacilityId?: string;
        scope?: {
          companyId?: string;
          siteId?: string;
          facilityId?: string;
        };
      };

      const fromTaskScopeIds = normalizeText(scopedTask.scopeCompanyId)
        ? getScopeLabel(
            scopedTask.scopeCompanyId ?? "",
            normalizeText(scopedTask.scopeSiteId) || undefined,
            normalizeText(scopedTask.scopeFacilityId) || undefined
          )
        : "";
      if (fromTaskScopeIds) {
        return fromTaskScopeIds;
      }

      const fromTaskScopeObject = normalizeText(scopedTask.scope?.companyId)
        ? getScopeLabel(
            scopedTask.scope?.companyId ?? "",
            normalizeText(scopedTask.scope?.siteId) || undefined,
            normalizeText(scopedTask.scope?.facilityId) || undefined
          )
        : "";
      if (fromTaskScopeObject) {
        return fromTaskScopeObject;
      }

      if (refs.legalDoc?.scopeOverride?.companyId) {
        const fromLegalDoc = getScopeLabel(
          refs.legalDoc.scopeOverride.companyId,
          refs.legalDoc.scopeOverride.siteId,
          refs.legalDoc.scopeOverride.facilityId
        );
        if (fromLegalDoc) {
          return fromLegalDoc;
        }
      }

      if (refs.project?.companyId) {
        const fromProject = getScopeLabel(
          refs.project.companyId,
          refs.project.siteId,
          refs.project.facilityId
        );
        if (fromProject) {
          return fromProject;
        }
      }

      return normalizeText(task.scopeLabel);
    };

    const getTaskShortDescription = (
      task: Task,
      refs: ReturnType<typeof getTaskReferences>
    ) => {
      const taskShortDescription = normalizeText(
        (task as Task & { shortDescription?: string }).shortDescription
      );
      if (taskShortDescription) {
        return truncate(taskShortDescription, SHORT_DESCRIPTION_MAX_CHARS);
      }

      const taskDescription = normalizeText((task as Task & { description?: string }).description);
      if (taskDescription) {
        return truncate(taskDescription, SHORT_DESCRIPTION_MAX_CHARS);
      }

      const deadlineDescription = normalizeText(refs.deadline?.description);
      if (deadlineDescription) {
        return truncate(deadlineDescription, SHORT_DESCRIPTION_MAX_CHARS);
      }

      const obligationWithDescriptions = refs.obligation as
        | {
            shortDescription?: string;
            longDescription?: string;
            infoTextLong?: string;
          }
        | undefined;
      const obligationShortDescription = normalizeText(obligationWithDescriptions?.shortDescription);
      if (obligationShortDescription) {
        return truncate(obligationShortDescription, SHORT_DESCRIPTION_MAX_CHARS);
      }

      const obligationLongDescription = normalizeText(
        obligationWithDescriptions?.longDescription ?? refs.obligation?.infoTextLong
      );
      if (obligationLongDescription) {
        return truncate(obligationLongDescription, SHORT_DESCRIPTION_MAX_CHARS);
      }

      const legalDocShortDescription = normalizeText(refs.legalDoc?.shortDescription);
      if (legalDocShortDescription) {
        return truncate(legalDocShortDescription, SHORT_DESCRIPTION_MAX_CHARS);
      }

      const projectShortDescription = normalizeText(refs.project?.shortDescription);
      if (projectShortDescription) {
        return truncate(projectShortDescription, SHORT_DESCRIPTION_MAX_CHARS);
      }

      return dash;
    };

    const getTaskContextLines = (
      task: Task,
      refs: ReturnType<typeof getTaskReferences>
    ) => {
      const lines: string[] = [];
      const projectTitle = normalizeText(refs.project?.title);
      if (projectTitle) {
        lines.push(
          `${t("reports.tasksAdmin.context.project")}: ${truncate(projectTitle, CONTEXT_LINE_MAX_CHARS)}`
        );
      }

      const legalDocTitle = normalizeText(refs.legalDoc?.title);
      if (legalDocTitle) {
        lines.push(
          `${t("reports.tasksAdmin.context.document")}: ${truncate(legalDocTitle, CONTEXT_LINE_MAX_CHARS)}`
        );
      }

      const obligationTitle = normalizeText(refs.obligation?.title);
      const deadlineTitle = normalizeText(refs.deadline?.title);
      const sourceTitle =
        obligationTitle || deadlineTitle || normalizeText(task.title);
      if (sourceTitle) {
        lines.push(
          `${t(
            obligationTitle || task.type === "OBLIGATION"
              ? "reports.tasksAdmin.context.obligation"
              : "reports.tasksAdmin.context.deadline"
          )}: ${truncate(sourceTitle, CONTEXT_LINE_MAX_CHARS)}`
        );
      }

      return lines;
    };

    const filtered = tasks
      .filter((task) => task.status !== "DONE")
      .filter((task) => {
        const refs = getTaskReferences(task);
        const resolvedScopeLabel = getTaskScopeLabel(task, refs);
        if (scopeLabelFilter && resolvedScopeLabel !== scopeLabelFilter) {
          return false;
        }
        if (assigneeId && task.assignedToUserId !== assigneeId) {
          return false;
        }
        if (dueRange === "30") {
          return Boolean(task.dueDate) && task.dueDate >= todayISO && task.dueDate <= dueSoonLimit;
        }
        if (dueRange === "overdue") {
          return isDueOverdue(task.dueDate, todayISO);
        }
        return true;
      });

    const sorted = [...filtered].sort((left, right) => {
      const leftOverdue = isDueOverdue(left.dueDate, todayISO);
      const rightOverdue = isDueOverdue(right.dueDate, todayISO);
      if (leftOverdue !== rightOverdue) {
        return rightOverdue ? 1 : -1;
      }

      const leftDue = left.dueDate || "9999-12-31";
      const rightDue = right.dueDate || "9999-12-31";
      const dueDiff = leftDue.localeCompare(rightDue);
      if (dueDiff !== 0) {
        return dueDiff;
      }

      const leftAssignee = getAssigneeLabel(left, getUserLabel, dash);
      const rightAssignee = getAssigneeLabel(right, getUserLabel, dash);
      return leftAssignee.localeCompare(rightAssignee);
    });

    return sorted.map((task) => {
      const refs = getTaskReferences(task);
      const resolvedScopeLabel = getTaskScopeLabel(task, refs);

      return {
        id: task.id,
        dueDate: task.dueDate || "",
        assignee: getAssigneeLabel(task, getUserLabel, dash),
        title: task.title,
        shortDescription: getTaskShortDescription(task, refs),
        contextLines: getTaskContextLines(task, refs),
        scope: truncate(resolvedScopeLabel, SCOPE_MAX_CHARS) || dash,
        isOverdue: isDueOverdue(task.dueDate, todayISO)
      };
    });
  }, [
    assigneeId,
    dash,
    deadlineById,
    dueRange,
    dueSoonLimit,
    getScopeLabel,
    getUserLabel,
    legalDocById,
    obligationById,
    projectById,
    scopeLabelFilter,
    tasks,
    todayISO
  ]);

  const overdueCount = useMemo(() => rows.filter((row) => row.isOverdue).length, [rows]);
  const dueSoonCount = useMemo(
    () =>
      rows.filter((row) => Boolean(row.dueDate) && row.dueDate >= todayISO && row.dueDate <= dueSoonLimit)
        .length,
    [dueSoonLimit, rows, todayISO]
  );

  const topAssignees = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      if (!row.assignee || row.assignee === dash) {
        return;
      }
      counts.set(row.assignee, (counts.get(row.assignee) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((left, right) => {
        if (left[1] !== right[1]) {
          return right[1] - left[1];
        }
        return left[0].localeCompare(right[0]);
      })
      .slice(0, 5)
      .map(([label, count]) => `${label} (${count})`);
  }, [dash, rows]);

  const pages = useMemo(() => buildPages(rows), [rows]);
  const totalPages = pages.length;

  const createdAtLabel = formatDateTimeStamp(generatedAt);
  const createdByLabel = currentUser ? getUserDisplayName(currentUser) : t("reports.tasksAdmin.defaultCreatedBy");
  const siteLabel = scopeLabelFilter || t("common.all");

  const filterParts = [
    scopeLabelFilter ? `${t("reports.tasksAdmin.filters.scope")}: ${scopeLabelFilter}` : "",
    assigneeId
      ? `${t("reports.tasksAdmin.filters.assignee")}: ${getUserLabel(assigneeId) || dash}`
      : "",
    dueRange === "30"
      ? `${t("reports.tasksAdmin.filters.dueRange")}: ${t("reports.tasksAdmin.filters.dueRange30")}`
      : "",
    dueRange === "overdue"
      ? `${t("reports.tasksAdmin.filters.dueRange")}: ${t("reports.tasksAdmin.filters.dueRangeOverdue")}`
      : ""
  ].filter(Boolean);
  const filterSummary = filterParts.length ? filterParts.join(" · ") : t("common.all");
  const handlePrint = async () => {
    document.title = fileTitle;
    if (reportRef.current) {
      await waitForReportAssets(reportRef.current);
    }
    window.print();
  };

  if (!actor.isAdmin) {
    return (
      <div className="tasksReportScreen">
        <Card>
          <p className="placeholderText">{t("reports.tasksAdmin.adminOnly")}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="tasksReportRoot">
      <div className="tasksReportToolbar noPrint">
        <Button onClick={handlePrint}>{t("reports.tasksAdmin.print")}</Button>
        <p className="tasksReportFileNameHint">
          {t("reports.tasksAdmin.fileNameHint")}: {fileTitle}.pdf
        </p>
      </div>

      <div className="tasksReportPages" ref={reportRef}>
        {pages.map((pageRows, index) => (
          <section className="printPage tasksReportPage" key={`tasks-report-page-${index + 1}`}>
            <header className="tasksReportHeader">
              <div className="tasksReportHeaderText">
                <h1 className="tasksReportTitle">{t("reports.tasksAdmin.headerTitle")}</h1>
                <div className="tasksReportMetaLine">
                  <span className="tasksReportMetaLabel">{t("reports.tasksAdmin.createdAt")}:</span>
                  <span>{createdAtLabel}</span>
                </div>
                <div className="tasksReportMetaLine">
                  <span className="tasksReportMetaLabel">{t("reports.tasksAdmin.filters.label")}:</span>
                  <span>{filterSummary}</span>
                </div>
              </div>
              {logoError ? (
                <span className="tasksReportLogoFallback">
                  {t("reports.tasksAdmin.logoWordmark")}
                </span>
              ) : (
                <img
                  className="tasksReportLogo"
                  src={logoSrc}
                  alt={t("reports.tasksAdmin.logoWordmark")}
                  loading="eager"
                  decoding="async"
                  onError={() => setLogoError(true)}
                />
              )}
            </header>

            {index === 0 ? (
              <section className="tasksReportSummary">
                <h2 className="tasksReportSectionTitle">{t("reports.tasksAdmin.summary.title")}</h2>
                <div className="tasksReportSummaryGrid">
                  <div className="tasksReportSummaryItem">
                    <span className="tasksReportSummaryLabel">{t("reports.tasksAdmin.summary.openTotal")}</span>
                    <strong className="tasksReportSummaryValue">{rows.length}</strong>
                  </div>
                  <div className="tasksReportSummaryItem">
                    <span className="tasksReportSummaryLabel">{t("reports.tasksAdmin.summary.overdue")}</span>
                    <strong className="tasksReportSummaryValue">{overdueCount}</strong>
                  </div>
                  <div className="tasksReportSummaryItem">
                    <span className="tasksReportSummaryLabel">{t("reports.tasksAdmin.summary.dueSoon")}</span>
                    <strong className="tasksReportSummaryValue">{dueSoonCount}</strong>
                  </div>
                  <div className="tasksReportSummaryItem tasksReportSummaryTopAssignees">
                    <span className="tasksReportSummaryLabel">{t("reports.tasksAdmin.summary.topAssignees")}</span>
                    <strong className="tasksReportSummaryValue tasksReportSummaryTopValue">
                      {topAssignees.length ? topAssignees.join(", ") : dash}
                    </strong>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="tasksReportTableSection">
              <table className="tasksReportTable">
                <colgroup>
                  <col className="tasksReportColDue" />
                  <col className="tasksReportColAssignee" />
                  <col className="tasksReportColTask" />
                  <col className="tasksReportColShort" />
                  <col className="tasksReportColContext" />
                  <col className="tasksReportColScope" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t("reports.tasksAdmin.table.due")}</th>
                    <th>{t("reports.tasksAdmin.table.assignee")}</th>
                    <th>{t("reports.tasksAdmin.table.task")}</th>
                    <th>{t("reports.tasksAdmin.table.short")}</th>
                    <th>{t("reports.tasksAdmin.table.context")}</th>
                    <th>{t("reports.tasksAdmin.table.scope")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length ? (
                    pageRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="tasksReportDueCell">
                            <span>{row.dueDate || dash}</span>
                            {row.isOverdue ? (
                              <Badge variant="danger">{t("reports.tasksAdmin.badge.overdue")}</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td>{row.assignee || dash}</td>
                        <td>{row.title || dash}</td>
                        <td className="tasksReportShortCell">{row.shortDescription || dash}</td>
                        <td className="tasksReportContextCell">
                          {row.contextLines.length ? (
                            row.contextLines.map((line, lineIndex) => (
                              <div className="tasksReportContextLine" key={`${row.id}-context-${lineIndex}`}>
                                {line}
                              </div>
                            ))
                          ) : (
                            <span>{dash}</span>
                          )}
                        </td>
                        <td className="tasksReportScopeCell">{row.scope || dash}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="tasksReportEmptyCell">
                        {t("reports.tasksAdmin.empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <footer className="tasksReportFooter">
              <div className="tasksReportFooterColumn">
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("reports.tasksAdmin.footer.documentNumber")}:</span>
                  <span>{t("reports.tasksAdmin.footer.documentNumberValue")}</span>
                </div>
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("reports.tasksAdmin.footer.status")}:</span>
                  <span>{t("common.statusDraft")}</span>
                </div>
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("reports.tasksAdmin.footer.createdBy")}:</span>
                  <span>{createdByLabel || t("reports.tasksAdmin.defaultCreatedBy")}</span>
                </div>
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("reports.tasksAdmin.footer.approvedBy")}:</span>
                  <span>{dash}</span>
                </div>
              </div>

              <div className="tasksReportFooterColumn">
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("reports.tasksAdmin.footer.validFrom")}:</span>
                  <span>{todayISO}</span>
                </div>
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("reports.tasksAdmin.footer.confidentiality")}:</span>
                  <span>{t("common.confidentialInternal")}</span>
                </div>
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("reports.tasksAdmin.footer.site")}:</span>
                  <span>{siteLabel}</span>
                </div>
              </div>

              <div className="tasksReportFooterColumn tasksReportFooterMeta">
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("reports.tasksAdmin.footer.language")}:</span>
                  <span>{t("common.languageGerman")}</span>
                </div>
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("common.page")}:</span>
                  <span>
                    {index + 1} {t("reports.tasksAdmin.footer.of")} {totalPages}
                  </span>
                </div>
                <div className="tasksReportFooterRow">
                  <span className="tasksReportFooterLabel">{t("common.version")}:</span>
                  <span>{t("reports.tasksAdmin.footer.versionValue")}</span>
                </div>
              </div>
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}
