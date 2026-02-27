import React, { useMemo, useState } from "react";
import { Breadcrumbs, Button, Card, DataTable, Input, Select } from "@nemetz/ui";
import { t } from "../i18n";
import { buildCsv, downloadCsv } from "../services/csvExport";
import { useAuthorization } from "../state/AuthorizationStore";
import { useProjects } from "../state/ProjectsStore";
import { useTasks } from "../state/TasksStore";

function toISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getRange(period: string, customFrom: string, customTo: string) {
  const today = new Date();
  const todayISO = toISO(today);

  if (period === "custom") {
    return {
      from: customFrom || todayISO,
      to: customTo || todayISO
    };
  }

  const days = period === "30" ? 30 : period === "90" ? 90 : 365;
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - days);
  return {
    from: toISO(fromDate),
    to: todayISO
  };
}

function toPercent(done: number, total: number) {
  if (!total) {
    return "0%";
  }
  return `${Math.round((done / total) * 100)}%`;
}

export default function ReportsPage() {
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { actor } = useAuthorization();
  const [filters, setFilters] = useState({
    period: "365",
    customFrom: "",
    customTo: "",
    scopeLabel: "",
    projectId: "",
    includeArchived: false
  });

  const range = useMemo(
    () => getRange(filters.period, filters.customFrom, filters.customTo),
    [filters.customFrom, filters.customTo, filters.period]
  );

  const scopeOptions = useMemo(() => {
    const labels = tasks
      .map((task) => task.scopeLabel)
      .filter((label): label is string => Boolean(label));
    return Array.from(new Set(labels)).map((label) => ({ value: label, label }));
  }, [tasks]);

  const projectOptions = useMemo(
    () =>
      projects
        .filter((project) => (filters.includeArchived ? true : !project.isArchived))
        .map((project) => ({ value: project.id, label: project.title })),
    [filters.includeArchived, projects]
  );

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const inRange = task.dueDate >= range.from && task.dueDate <= range.to;
        const matchesScope = filters.scopeLabel ? task.scopeLabel === filters.scopeLabel : true;
        const matchesProject = filters.projectId ? task.projectId === filters.projectId : true;
        return inRange && matchesScope && matchesProject;
      }),
    [filters.projectId, filters.scopeLabel, range.from, range.to, tasks]
  );

  const obligationTasks = filteredTasks.filter((task) => task.type === "OBLIGATION");
  const deadlineTasks = filteredTasks.filter((task) => task.type === "DEADLINE");

  const overallDone = filteredTasks.filter((task) => task.status === "DONE").length;
  const overdueCount = filteredTasks.filter((task) => task.status === "OVERDUE").length;

  const mandatoryTasks = obligationTasks.filter(
    (task) => task.obligationLevel === "MANDATORY"
  );
  const recommendedTasks = obligationTasks.filter(
    (task) => task.obligationLevel === "RECOMMENDED"
  );

  const breakdownRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        scope: string;
        project: string;
        mandatoryTotal: number;
        mandatoryDone: number;
        mandatoryOverdue: number;
        recommendedTotal: number;
        recommendedDone: number;
        recommendedOverdue: number;
      }
    >();

    obligationTasks.forEach((task) => {
      const projectTitle =
        projects.find((project) => project.id === task.projectId)?.title ||
        t("common.notAvailable");
      const key = `${task.scopeLabel || t("common.notAvailable")}::${projectTitle}`;
      const row =
        grouped.get(key) ??
        {
          scope: task.scopeLabel || t("common.notAvailable"),
          project: projectTitle,
          mandatoryTotal: 0,
          mandatoryDone: 0,
          mandatoryOverdue: 0,
          recommendedTotal: 0,
          recommendedDone: 0,
          recommendedOverdue: 0
        };

      if (task.obligationLevel === "MANDATORY") {
        row.mandatoryTotal += 1;
        if (task.status === "DONE") {
          row.mandatoryDone += 1;
        }
        if (task.status === "OVERDUE") {
          row.mandatoryOverdue += 1;
        }
      } else if (task.obligationLevel === "RECOMMENDED") {
        row.recommendedTotal += 1;
        if (task.status === "DONE") {
          row.recommendedDone += 1;
        }
        if (task.status === "OVERDUE") {
          row.recommendedOverdue += 1;
        }
      }

      grouped.set(key, row);
    });

    return Array.from(grouped.values()).sort((a, b) => a.scope.localeCompare(b.scope));
  }, [obligationTasks, projects]);

  const columns = [
    {
      key: "scope",
      header: t("reports.table.scope"),
      render: (row: (typeof breakdownRows)[number]) => row.scope
    },
    {
      key: "project",
      header: t("reports.table.project"),
      render: (row: (typeof breakdownRows)[number]) => row.project
    },
    {
      key: "mandatory",
      header: t("reports.table.mandatory"),
      render: (row: (typeof breakdownRows)[number]) =>
        `${row.mandatoryDone}/${row.mandatoryTotal} · ${toPercent(
          row.mandatoryDone,
          row.mandatoryTotal
        )} · ${t("reports.kpi.overdue")}: ${row.mandatoryOverdue}`
    },
    {
      key: "recommended",
      header: t("reports.table.recommended"),
      render: (row: (typeof breakdownRows)[number]) =>
        `${row.recommendedDone}/${row.recommendedTotal} · ${toPercent(
          row.recommendedDone,
          row.recommendedTotal
        )} · ${t("reports.kpi.overdue")}: ${row.recommendedOverdue}`
    }
  ];

  const handleCsvExport = () => {
    const header = [
      "scope",
      "project",
      "mandatory_total",
      "mandatory_done",
      "mandatory_overdue",
      "mandatory_rate",
      "recommended_total",
      "recommended_done",
      "recommended_overdue",
      "recommended_rate"
    ];

    const summaryRows = [
      ["range_from", range.from],
      ["range_to", range.to],
      ["overall_total", filteredTasks.length],
      ["overall_done", overallDone],
      ["overall_rate", toPercent(overallDone, filteredTasks.length)],
      ["mandatory_total", mandatoryTasks.length],
      [
        "mandatory_done_rate",
        toPercent(
          mandatoryTasks.filter((task) => task.status === "DONE").length,
          mandatoryTasks.length
        )
      ],
      ["recommended_total", recommendedTasks.length],
      [
        "recommended_done_rate",
        toPercent(
          recommendedTasks.filter((task) => task.status === "DONE").length,
          recommendedTasks.length
        )
      ],
      ["deadlines_total", deadlineTasks.length],
      [
        "deadlines_done_rate",
        toPercent(
          deadlineTasks.filter((task) => task.status === "DONE").length,
          deadlineTasks.length
        )
      ]
    ];

    const detailRows = breakdownRows.map((row) => [
      row.scope,
      row.project,
      row.mandatoryTotal,
      row.mandatoryDone,
      row.mandatoryOverdue,
      toPercent(row.mandatoryDone, row.mandatoryTotal),
      row.recommendedTotal,
      row.recommendedDone,
      row.recommendedOverdue,
      toPercent(row.recommendedDone, row.recommendedTotal)
    ]);

    const csv = buildCsv([
      [t("reports.csv.summarySection")],
      ...summaryRows,
      [""],
      header,
      ...detailRows
    ]);

    downloadCsv(csv, `compliance-report-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleCreateTasksAdminReport = () => {
    window.open("/compliance/reports/tasks", "_blank", "noopener,noreferrer");
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "reports", label: t("reports.title") }
            ]}
          />
          <h1 className="pageTitle">{t("reports.title")}</h1>
        </div>
        <Button onClick={handleCsvExport}>{t("reports.action.csvExport")}</Button>
      </div>

      <Card>
        <div className="reportsAdminCard">
          <div className="reportsAdminCardBody">
            <h2 className="sectionTitle">{t("reports.tasksAdmin.title")}</h2>
            <p className="placeholderText">{t("reports.tasksAdmin.description")}</p>
            {!actor.isAdmin ? (
              <p className="placeholderText">{t("reports.tasksAdmin.adminOnly")}</p>
            ) : null}
          </div>
          {actor.isAdmin ? (
            <Button onClick={handleCreateTasksAdminReport}>
              {t("reports.tasksAdmin.createPdf")}
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="filterRowFive">
          <Select
            options={[
              { value: "30", label: t("reports.filters.period.30") },
              { value: "90", label: t("reports.filters.period.90") },
              { value: "365", label: t("reports.filters.period.365") },
              { value: "custom", label: t("reports.filters.period.custom") }
            ]}
            value={filters.period}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, period: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("reports.filters.scope") }, ...scopeOptions]}
            value={filters.scopeLabel}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, scopeLabel: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("reports.filters.project") }, ...projectOptions]}
            value={filters.projectId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, projectId: event.target.value }))
            }
          />
          {filters.period === "custom" ? (
            <>
              <Input
                type="date"
                value={filters.customFrom}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, customFrom: event.target.value }))
                }
              />
              <Input
                type="date"
                value={filters.customTo}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, customTo: event.target.value }))
                }
              />
            </>
          ) : (
            <>
              <Input value={range.from} readOnly />
              <Input value={range.to} readOnly />
            </>
          )}
        </div>
        <div className="sectionSpacer" />
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, includeArchived: event.target.checked }))
            }
          />
          <span>{t("reports.filters.includeArchived")}</span>
        </label>
      </Card>

      <div className="cardGrid">
        <Card>
          <div className="statCard">
            <div className="statLabel">{t("reports.kpi.overallRate")}</div>
            <div className="statValue">{toPercent(overallDone, filteredTasks.length)}</div>
          </div>
        </Card>
        <Card>
          <div className="statCard">
            <div className="statLabel">{t("reports.kpi.mandatoryRate")}</div>
            <div className="statValue">
              {toPercent(
                mandatoryTasks.filter((task) => task.status === "DONE").length,
                mandatoryTasks.length
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="statCard">
            <div className="statLabel">{t("reports.kpi.recommendedRate")}</div>
            <div className="statValue">
              {toPercent(
                recommendedTasks.filter((task) => task.status === "DONE").length,
                recommendedTasks.length
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="statCard">
            <div className="statLabel">{t("reports.kpi.overdue")}</div>
            <div className="statValue">{overdueCount}</div>
          </div>
        </Card>
      </div>

      <Card>
        <p className="placeholderText">{t("reports.note.deadlineInclusion")}</p>
        <p className="placeholderText">
          {t("reports.kpi.deadlineBlock")}:{" "}
          {`${deadlineTasks.filter((task) => task.status === "DONE").length}/${deadlineTasks.length} · ${toPercent(
            deadlineTasks.filter((task) => task.status === "DONE").length,
            deadlineTasks.length
          )}`}
        </p>
      </Card>

      <DataTable columns={columns} data={breakdownRows} getRowKey={(row) => `${row.scope}-${row.project}`} />
    </div>
  );
}
