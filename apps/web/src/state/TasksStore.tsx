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
  assignedTo?: string;
  deputyId?: string;
  obligationLevel?: "MANDATORY" | "RECOMMENDED";
  scopeLabel: string;
  projectId?: string;
  legalDocId?: string;
  completedAt?: string;
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

function addInterval(date: Date, unit: "MONTH" | "YEAR", value: number) {
  const next = new Date(date);
  if (unit === "YEAR") {
    next.setFullYear(next.getFullYear() + value);
  } else {
    next.setMonth(next.getMonth() + value);
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
          legalDocId: obligation.legalDocId
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
  reopenTask: (taskId: string) => void;
};

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { obligations } = useObligations();
  const {
    deadlines,
    getDeadlineStatus,
    markDeadlineDone,
    reopenDeadline
  } = useDeadlines();
  const { legalDocs, getEffectiveScopeForLegalDoc } = useLegalDocs();
  const { projects } = useProjects();
  const { getScopeLabel } = useScopes();
  const { getUserLabel } = useUsers();
  const { taskState, setTaskStatus: setObligationTaskStatus } = useTaskState();

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

        if (seed.type === "OBLIGATION") {
          const doc = legalDocs.find((item) => item.id === seed.legalDocId);
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
          if (status !== "DONE" && seed.dueDate < today) {
            status = "OVERDUE";
          }
        } else {
          const deadline = deadlines.find((item) => item.id === seed.deadlineId);
          status = deadline ? getDeadlineStatus(deadline) : "OPEN";
          completedAt = deadline?.status === "DONE" ? deadline.updatedAt : undefined;

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
          assignedTo: seed.assignedToUserId ? getUserLabel(seed.assignedToUserId) : "",
          deputyId: seed.deputyUserId ? getUserLabel(seed.deputyUserId) : "",
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
    getUserLabel,
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
      reopenTask
    }),
    [markTaskDone, reopenTask, setTaskStatus, tasks]
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
