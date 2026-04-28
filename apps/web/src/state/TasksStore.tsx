import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useDeadlines } from "./DeadlinesStore";
import { useLegalDocs } from "./LegalDocsStore";
import { useObligations } from "./ObligationsStore";
import { useProjects } from "./ProjectsStore";
import { useScopes } from "./ScopesStore";
import { buildObligationTaskInstanceId, useTaskState } from "./TaskStateStore";
import { useUsers } from "./UsersStore";
import type { Deadline } from "./DeadlinesStore";
import type { Obligation } from "./ObligationsStore";
import type { AttachmentMeta } from "../types/attachments";
import type { Evidence, EvidenceOutcome } from "../types/evidence";
import { t } from "../i18n";

export type TaskType = "OBLIGATION" | "DEADLINE";
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "OVERDUE";
export type TaskStatusInput = Exclude<TaskStatus, "OVERDUE">;

export type Task = {
  id: string;
  type: TaskType;
  obligationId?: string;
  deadlineId?: string;
  title: string;
  status: TaskStatus;
  dueDate: string;
  assignedToUserId?: string;
  assignedToLabel?: string;
  assignedTo?: string;
  deputyUserId?: string;
  deputyLabel?: string;
  deputyId?: string;
  obligationLevel?: "MANDATORY" | "RECOMMENDED";
  scopeLabel: string;
  projectId?: string;
  legalDocId?: string;
  completedAt?: string;
  completedByUserId?: string;
  evidence?: Evidence[];
  requiredEvidence?: Obligation["evidenceRequirements"];
};

type TaskSeed = Omit<
  Task,
  "status" | "scopeLabel" | "assignedTo" | "deputyId" | "completedAt"
> & {
  assignedToUserId?: string;
  deputyUserId?: string;
};

const TASK_HORIZON_DAYS = 365;

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addInterval(date: Date, unit: NonNullable<Obligation["intervalUnit"]>, value: number) {
  const next = new Date(date);
  switch (unit) {
    case "DAY":
      next.setDate(next.getDate() + value);
      break;
    case "WEEK":
      next.setDate(next.getDate() + value * 7);
      break;
    case "QUARTER":
      next.setMonth(next.getMonth() + value * 3);
      break;
    case "YEAR":
      next.setFullYear(next.getFullYear() + value);
      break;
    case "MONTH":
    default:
      next.setMonth(next.getMonth() + value);
      break;
  }
  return next;
}

function buildDeadlineTaskId(deadlineId: string) {
  return `deadline:${deadlineId}`;
}

function parseDeadlineTaskId(taskId: string) {
  return taskId.startsWith("deadline:") ? taskId.slice(9) : "";
}

export function generateTasksFromObligations(
  obligations: Obligation[],
  horizonDays = TASK_HORIZON_DAYS
): TaskSeed[] {
  const tasks: TaskSeed[] = [];
  const today = new Date(`${todayStamp()}T00:00:00`);
  const horizonEnd = new Date(today);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

  obligations
    .filter((obligation) => !obligation.isArchived)
    .forEach((obligation) => {
      const createSeed = (dueDateISO: string) => {
        tasks.push({
          id: buildObligationTaskInstanceId(obligation.id, dueDateISO),
          type: "OBLIGATION",
          obligationId: obligation.id,
          title: obligation.title,
          dueDate: dueDateISO,
          assignedToUserId: obligation.ownerUserId,
          deputyUserId: obligation.deputyUserId,
          obligationLevel: obligation.level,
          legalDocId: obligation.legalDocId,
          requiredEvidence: obligation.evidenceRequirements
        });
      };

      if (obligation.scheduleType === "ONCE") {
        if (obligation.firstDueDate) {
          createSeed(obligation.firstDueDate);
        }
        return;
      }

      const unit = obligation.intervalUnit;
      const value = obligation.intervalValue ?? 0;
      if (!unit || value <= 0) {
        return;
      }

      const startDate = obligation.firstDueDate ? toDate(obligation.firstDueDate) : today;
      if (Number.isNaN(startDate.getTime())) {
        return;
      }

      let cursor = new Date(startDate);

      if (obligation.scheduleType === "ONCE_THEN_RECURRING") {
        if (!obligation.firstDueDate) {
          return;
        }
        createSeed(obligation.firstDueDate);
        cursor = addInterval(startDate, unit, value);
      }

      while (cursor <= horizonEnd) {
        const dueDate = cursor.toISOString().slice(0, 10);
        createSeed(dueDate);
        cursor = addInterval(cursor, unit, value);
      }
    });

  return tasks;
}

export function generateTasksFromDeadlines(deadlines: Deadline[]): TaskSeed[] {
  return deadlines
    .filter((deadline) => !deadline.isArchived)
    .map((deadline) => ({
      id: buildDeadlineTaskId(deadline.id),
      type: "DEADLINE",
      deadlineId: deadline.id,
      title: deadline.title,
      dueDate: deadline.dueDate,
      assignedToUserId: deadline.ownerUserId,
      deputyUserId: deadline.deputyUserId,
      projectId: deadline.projectId,
      legalDocId: deadline.legalDocId
    }));
}

export type TasksContextValue = {
  tasks: Task[];
  setTaskStatus: (taskId: string, status: TaskStatusInput) => void;
  markTaskDone: (taskId: string) => void;
  markTaskDoneWithEvidence: (
    taskId: string,
    input: { note?: string; outcome?: EvidenceOutcome; attachments: AttachmentMeta[] }
  ) => void;
  reopenTask: (taskId: string) => void;
};

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { obligations } = useObligations();
  const {
    deadlines,
    getDeadlineStatus,
    markDeadlineDone,
    markDeadlineDoneWithEvidence,
    reopenDeadline
  } = useDeadlines();
  const { legalDocs, getEffectiveScopeForLegalDoc } = useLegalDocs();
  const { projects } = useProjects();
  const { getScopeLabel } = useScopes();
  const { getDisplayName, getUser } = useUsers();
  const {
    taskState,
    setTaskStatus: setObligationTaskStatus,
    markDoneWithEvidence: markObligationDoneWithEvidence
  } = useTaskState();

  const setTaskStatus = useCallback(
    (taskId: string, status: TaskStatusInput) => {
      const deadlineId = parseDeadlineTaskId(taskId);
      if (deadlineId) {
        if (status === "DONE") {
          markDeadlineDone(deadlineId);
          return;
        }
        reopenDeadline(deadlineId);
        return;
      }
      setObligationTaskStatus(taskId, status);
    },
    [markDeadlineDone, reopenDeadline, setObligationTaskStatus]
  );

  const markTaskDone = useCallback(
    (taskId: string) => setTaskStatus(taskId, "DONE"),
    [setTaskStatus]
  );

  const markTaskDoneWithEvidence = useCallback(
    (
      taskId: string,
      input: { note?: string; outcome?: EvidenceOutcome; attachments: AttachmentMeta[] }
    ) => {
      const deadlineId = parseDeadlineTaskId(taskId);
      if (deadlineId) {
        markDeadlineDoneWithEvidence(deadlineId, input);
        return;
      }
      markObligationDoneWithEvidence(taskId, input);
    },
    [markDeadlineDoneWithEvidence, markObligationDoneWithEvidence]
  );

  const reopenTask = useCallback(
    (taskId: string) => setTaskStatus(taskId, "OPEN"),
    [setTaskStatus]
  );

  const tasks = useMemo<Task[]>(() => {
    const obligationSeeds = generateTasksFromObligations(obligations, TASK_HORIZON_DAYS);
    const deadlineSeeds = generateTasksFromDeadlines(deadlines);
    const seeds = [...obligationSeeds, ...deadlineSeeds];
    const today = todayStamp();

    return seeds
      .map((seed) => {
        let projectId = seed.projectId;
        let legalDocId = seed.legalDocId;
        let scopeLabel = "";
        let status: TaskStatus = "OPEN";
        let completedAt: string | undefined;
        let completedByUserId: string | undefined;
        let evidence: Evidence[] | undefined;
        let requiredEvidence: Obligation["evidenceRequirements"] | undefined;

        if (seed.type === "OBLIGATION") {
          const doc = legalDocs.find((item) => item.id === seed.legalDocId);
          const obligation = obligations.find((item) => item.id === seed.obligationId);
          legalDocId = doc?.id;
          projectId = doc?.projectId;
          if (doc) {
            const scope = getEffectiveScopeForLegalDoc(doc);
            if (scope) {
              scopeLabel = getScopeLabel(scope.companyId, scope.siteId, scope.facilityId);
            }
          }
          const stored = taskState[seed.id];
          status = stored?.status ?? "OPEN";
          completedAt = stored?.completedAt;
          completedByUserId = stored?.completedByUserId;
          evidence = stored?.evidence ?? [];
          requiredEvidence = obligation?.evidenceRequirements;
          if (status !== "DONE" && seed.dueDate < today) {
            status = "OVERDUE";
          }
        } else {
          const deadline = deadlines.find((item) => item.id === seed.deadlineId);
          status = deadline ? getDeadlineStatus(deadline) : "OPEN";
          completedAt = deadline?.status === "DONE" ? deadline.completedAt ?? deadline.updatedAt : undefined;
          completedByUserId = deadline?.completedByUserId;
          evidence = deadline?.evidence ?? [];

          if (legalDocId) {
            const doc = legalDocs.find((item) => item.id === legalDocId);
            if (doc) {
              projectId = projectId ?? doc.projectId;
              const scope = getEffectiveScopeForLegalDoc(doc);
              if (scope) {
                scopeLabel = getScopeLabel(scope.companyId, scope.siteId, scope.facilityId);
              }
            }
          }
        }

        if (!scopeLabel && projectId) {
          const project = projects.find((item) => item.id === projectId);
          if (project) {
            scopeLabel = getScopeLabel(project.companyId, project.siteId, project.facilityId);
          }
        }

        return {
          ...seed,
          status,
          completedAt,
          completedByUserId,
          evidence,
          requiredEvidence,
          assignedToUserId: seed.assignedToUserId,
          assignedToLabel: seed.assignedToUserId
            ? (() => {
                const assignedUser = getUser(seed.assignedToUserId);
                if (!assignedUser) {
                  return t("users.unknown");
                }
                return assignedUser.isArchived
                  ? `${getDisplayName(seed.assignedToUserId)} (${t("users.archived")})`
                  : getDisplayName(seed.assignedToUserId);
              })()
            : t("tasks.unassigned"),
          assignedTo: seed.assignedToUserId
            ? (() => {
                const assignedUser = getUser(seed.assignedToUserId);
                if (!assignedUser) {
                  return t("users.unknown");
                }
                return assignedUser.isArchived
                  ? `${getDisplayName(seed.assignedToUserId)} (${t("users.archived")})`
                  : getDisplayName(seed.assignedToUserId);
              })()
            : t("tasks.unassigned"),
          deputyUserId: seed.deputyUserId,
          deputyLabel: seed.deputyUserId
            ? (() => {
                const deputyUser = getUser(seed.deputyUserId);
                if (!deputyUser) {
                  return t("users.unknown");
                }
                return deputyUser.isArchived
                  ? `${getDisplayName(seed.deputyUserId)} (${t("users.archived")})`
                  : getDisplayName(seed.deputyUserId);
              })()
            : t("tasks.unassigned"),
          deputyId: seed.deputyUserId
            ? (() => {
                const deputyUser = getUser(seed.deputyUserId);
                if (!deputyUser) {
                  return t("users.unknown");
                }
                return deputyUser.isArchived
                  ? `${getDisplayName(seed.deputyUserId)} (${t("users.archived")})`
                  : getDisplayName(seed.deputyUserId);
              })()
            : t("tasks.unassigned"),
          scopeLabel,
          projectId,
          legalDocId
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [
    deadlines,
    getDeadlineStatus,
    getEffectiveScopeForLegalDoc,
    getScopeLabel,
    getDisplayName,
    getUser,
    legalDocs,
    obligations,
    projects,
    taskState
  ]);

  const value = useMemo(
    () => ({
      tasks,
      setTaskStatus,
      markTaskDone,
      markTaskDoneWithEvidence,
      reopenTask
    }),
    [markTaskDone, markTaskDoneWithEvidence, reopenTask, setTaskStatus, tasks]
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error("useTasks must be used within TasksProvider");
  }
  return context;
}
