import React, { useMemo, useState } from "react";
import { Breadcrumbs, Card, Input, Select } from "@nemetz/ui";
import HelpHintCard from "../components/HelpHintCard";
import { useRuntimeConfig } from "../config/runtimeConfig";
import { HELP_CONTEXT_SLUGS, getHelpHref } from "../help/helpContent";
import { t } from "../i18n";
import { useProjects } from "../state/ProjectsStore";
import { useTasks } from "../state/TasksStore";

function toISODate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getRange(period: string, customFrom: string, customTo: string) {
  const today = new Date();
  const todayISO = toISODate(today);

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
    from: toISODate(fromDate),
    to: todayISO
  };
}

function toPercent(done: number, total: number) {
  if (total <= 0) {
    return "0%";
  }
  return `${Math.round((done / total) * 100)}%`;
}

type GroupSummary = {
  total: number;
  done: number;
  overdue: number;
};

function summarizeTasks(
  tasks: Array<{ status: string }>,
  doneStatus = "DONE",
  overdueStatus = "OVERDUE"
): GroupSummary {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === doneStatus).length;
  const overdue = tasks.filter((task) => task.status === overdueStatus).length;
  return { total, done, overdue };
}

export default function ComplianceSummaryPage() {
  const runtimeConfig = useRuntimeConfig();
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const [filters, setFilters] = useState({
    period: "365",
    projectId: "",
    scopeLabel: "",
    customFrom: "",
    customTo: ""
  });

  const projectOptions = useMemo(
    () =>
      projects
        .filter((project) => !project.isArchived)
        .map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );

  const scopeOptions = useMemo(() => {
    const labels = tasks
      .map((task) => task.scopeLabel)
      .filter((label): label is string => Boolean(label));
    return Array.from(new Set(labels)).map((label) => ({ value: label, label }));
  }, [tasks]);

  const range = useMemo(
    () => getRange(filters.period, filters.customFrom, filters.customTo),
    [filters.customFrom, filters.customTo, filters.period]
  );

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const inRange = task.dueDate >= range.from && task.dueDate <= range.to;
        const matchesProject = filters.projectId ? task.projectId === filters.projectId : true;
        const matchesScope = filters.scopeLabel ? task.scopeLabel === filters.scopeLabel : true;
        return inRange && matchesProject && matchesScope;
      }),
    [filters.projectId, filters.scopeLabel, range.from, range.to, tasks]
  );

  const mandatorySummary = useMemo(
    () =>
      summarizeTasks(
        filteredTasks.filter((task) => task.obligationLevel === "MANDATORY")
      ),
    [filteredTasks]
  );

  const recommendedSummary = useMemo(
    () =>
      summarizeTasks(
        filteredTasks.filter((task) => task.obligationLevel === "RECOMMENDED")
      ),
    [filteredTasks]
  );

  const completedWithDate = useMemo(
    () =>
      filteredTasks.filter(
        (task) => task.status === "DONE" && typeof task.completedAt === "string"
      ),
    [filteredTasks]
  );

  const timelyCount = completedWithDate.filter(
    (task) => (task.completedAt ?? "").slice(0, 10) <= task.dueDate
  ).length;
  const lateCount = completedWithDate.length - timelyCount;

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "summary", label: t("complianceSummary.title") }
            ]}
          />
          <h1 className="pageTitle">{t("complianceSummary.title")}</h1>
        </div>
      </div>

      {runtimeConfig.features.enableHelpHints ? (
        <HelpHintCard
          hintId="hint.complianceSummary"
          title="Compliance Summary richtig lesen"
          bullets={[
            "Die Summary ist ein Lesemodul fuer Ueberblick und Trendbeobachtung.",
            "Operative Korrekturen erfolgen weiterhin in Projekten, Aufgaben, Fristen oder Auflagen.",
            "Wenn Zahlen ungewoehnlich wirken, pruefen Sie zuerst Zeitraum, Projekt- und Scope-Filter."
          ]}
          link={{
            label: "Passenden Hilfeartikel oeffnen",
            to: getHelpHref(HELP_CONTEXT_SLUGS.reports)
          }}
        />
      ) : null}

      <Card>
        <div className="filterRowFive">
          <Select
            options={[
              { value: "30", label: t("complianceSummary.filters.period.30") },
              { value: "90", label: t("complianceSummary.filters.period.90") },
              { value: "365", label: t("complianceSummary.filters.period.365") },
              { value: "custom", label: t("complianceSummary.filters.period.custom") }
            ]}
            value={filters.period}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, period: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("complianceSummary.filters.project") },
              ...projectOptions
            ]}
            value={filters.projectId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, projectId: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("complianceSummary.filters.scope") },
              ...scopeOptions
            ]}
            value={filters.scopeLabel}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, scopeLabel: event.target.value }))
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
      </Card>

      <div className="cardGrid">
        <Card>
          <div className="statCard">
            <div className="statLabel">{t("complianceSummary.mandatory.title")}</div>
            <div className="metaValue">
              {t("complianceSummary.metric.total")}: {mandatorySummary.total}
            </div>
            <div className="metaValue">
              {t("complianceSummary.metric.done")}: {mandatorySummary.done}
            </div>
            <div className="metaValue">
              {t("complianceSummary.metric.overdue")}: {mandatorySummary.overdue}
            </div>
            <div className="metaValue">
              {t("complianceSummary.metric.doneRate")}:{" "}
              {toPercent(mandatorySummary.done, mandatorySummary.total)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="statCard">
            <div className="statLabel">{t("complianceSummary.recommended.title")}</div>
            <div className="metaValue">
              {t("complianceSummary.metric.total")}: {recommendedSummary.total}
            </div>
            <div className="metaValue">
              {t("complianceSummary.metric.done")}: {recommendedSummary.done}
            </div>
            <div className="metaValue">
              {t("complianceSummary.metric.overdue")}: {recommendedSummary.overdue}
            </div>
            <div className="metaValue">
              {t("complianceSummary.metric.doneRate")}:{" "}
              {toPercent(recommendedSummary.done, recommendedSummary.total)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="statCard">
            <div className="statLabel">{t("complianceSummary.timeliness.title")}</div>
            <div className="metaValue">
              {t("complianceSummary.timeliness.onTime")}: {timelyCount}
            </div>
            <div className="metaValue">
              {t("complianceSummary.timeliness.late")}: {lateCount}
            </div>
            <div className="metaValue">
              {t("complianceSummary.metric.total")}: {completedWithDate.length}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
