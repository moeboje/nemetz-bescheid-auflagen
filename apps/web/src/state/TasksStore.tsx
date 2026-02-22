import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useDeadlines } from "./DeadlinesStore";
import { useLegalDocs } from "./LegalDocsStore";
import { useObligations } from "./ObligationsStore";
import { useProjects } from "./ProjectsStore";
import { useScopes } from "./ScopesStore";
import { useUsers } from "./UsersStore";
import { loadFromStorage, saveToStorage } from "./storage";
import type { Deadline } from "./DeadlinesStore";
import type { Obligation } from "./ObligationsStore";

export type TaskType = "OBLIGATION" | "DEADLINE";
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "OVERDUE";

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
};

export type TaskState = {
  status: TaskStatus;
  completedAt?: string;
};

export type TaskStateMap = Record<string, TaskState>;

type TaskSeed = Omit<Task, "status" | "scopeLabel">;

const STORAGE_KEY = "nemetz.taskState";

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

export function generateTasksFromObligations(obligations: Obligation[], horizonDays = 365): TaskSeed[] {
  const tasks: TaskSeed[] = [];
  const horizonEnd = new Date();
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

  obligations.forEach((obligation) => {
    if (obligation.scheduleType === "ONCE") {
      if (!obligation.firstDueDate) {
        return;
      }
      tasks.push({
        id: `ob-${obligation.id}-${obligation.firstDueDate}`,
        type: "OBLIGATION",
        obligationId: obligation.id,
        title: obligation.title,
        dueDate: obligation.firstDueDate,
        assignedTo: obligation.ownerUserId,
        deputyId: obligation.deputyUserId,
        obligationLevel: obligation.level,
        legalDocId: obligation.legalDocId
      });
      return;
    }

    const unit = obligation.intervalUnit;
    const value = obligation.intervalValue ?? 0;
    if (!unit || value <= 0) {
      return;
    }

    const startDate = obligation.firstDueDate ? toDate(obligation.firstDueDate) : new Date();
    let cursor = new Date(startDate);

    if (obligation.scheduleType === "ONCE_THEN_RECURRING") {
      if (!obligation.firstDueDate) {
        return;
      }
      tasks.push({
        id: `ob-${obligation.id}-${obligation.firstDueDate}`,
        type: "OBLIGATION",
        obligationId: obligation.id,
        title: obligation.title,
        dueDate: obligation.firstDueDate,
        assignedTo: obligation.ownerUserId,
        deputyId: obligation.deputyUserId,
        obligationLevel: obligation.level,
        legalDocId: obligation.legalDocId
      });
      cursor = addInterval(startDate, unit, value);
    }

    while (cursor <= horizonEnd) {
      const dueDate = cursor.toISOString().slice(0, 10);
      tasks.push({
        id: `ob-${obligation.id}-${dueDate}`,
        type: "OBLIGATION",
        obligationId: obligation.id,
        title: obligation.title,
        dueDate,
        assignedTo: obligation.ownerUserId,
        deputyId: obligation.deputyUserId,
        obligationLevel: obligation.level,
        legalDocId: obligation.legalDocId
      });
      cursor = addInterval(cursor, unit, value);
    }
  });

  return tasks;
}

export function generateTasksFromDeadlines(deadlines: Deadline[]): TaskSeed[] {
  return deadlines.map((deadline) => ({
    id: `dl-${deadline.id}`,
    type: "DEADLINE",
    deadlineId: deadline.id,
    title: deadline.title,
    dueDate: deadline.dueDate,
    assignedTo: deadline.ownerUserId,
    deputyId: deadline.deputyUserId,
    projectId: deadline.projectId,
    legalDocId: deadline.legalDocId
  }));
}

export type TasksContextValue = {
  tasks: Task[];
  taskState: TaskStateMap;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
};

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { obligations } = useObligations();
  const { deadlines, getDeadlineStatus, setDeadlineStatus } = useDeadlines();
  const { legalDocs, getEffectiveScopeForLegalDoc } = useLegalDocs();
  const { projects } = useProjects();
  const { getScopeLabel } = useScopes();
  const { getUserLabel } = useUsers();

  const [taskState, setTaskState] = useState<TaskStateMap>(() =>
    Object.fromEntries(
      Object.entries(loadFromStorage<TaskStateMap>(STORAGE_KEY, {})).filter(
        ([taskId]) => !taskId.startsWith("dl-")
      )
    )
  );

  const setTaskStatus = useCallback((taskId: string, status: TaskStatus) => {
    if (taskId.startsWith("dl-")) {
      const deadlineId = taskId.slice(3);
      if (deadlineId) {
        setDeadlineStatus(deadlineId, status === "DONE" ? "DONE" : "OPEN");
      }
      return;
    }
    setTaskState((prev) => ({
      ...prev,
      [taskId]: {
        status,
        completedAt: status === "DONE" ? todayStamp() : undefined
      }
    }));
  }, [setDeadlineStatus]);

  React.useEffect(() => {
    saveToStorage(STORAGE_KEY, taskState);
  }, [taskState]);

  const tasks = useMemo<Task[]>(() => {
    const obligationSeeds = generateTasksFromObligations(obligations);
    const deadlineSeeds = generateTasksFromDeadlines(deadlines);
    const seeds = [...obligationSeeds, ...deadlineSeeds];
    const today = todayStamp();

    return seeds
      .map((seed) => {
        let projectId = seed.projectId;
        let legalDocId = seed.legalDocId;
        let scopeLabel = "";

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
        }

        if (seed.type === "DEADLINE" && legalDocId) {
          const doc = legalDocs.find((item) => item.id === legalDocId);
          if (doc) {
            projectId = projectId ?? doc.projectId;
            const scope = getEffectiveScopeForLegalDoc(doc);
            if (scope) {
              scopeLabel = getScopeLabel(scope.companyId, scope.siteId, scope.facilityId);
            }
          }
        }

        if (!scopeLabel && projectId) {
          const project = projects.find((item) => item.id === projectId);
          if (project) {
            scopeLabel = getScopeLabel(project.companyId, project.siteId, project.facilityId);
          }
        }

        let status: TaskStatus = "OPEN";
        if (seed.type === "DEADLINE") {
          const deadline = deadlines.find((item) => item.id === seed.deadlineId);
          status = deadline ? getDeadlineStatus(deadline) : "OPEN";
        } else {
          const stored = taskState[seed.id];
          status = stored?.status ?? "OPEN";
          if (status !== "DONE" && seed.dueDate < today) {
            status = "OVERDUE";
          }
        }

        return {
          ...seed,
          status,
          assignedTo: seed.assignedTo ? getUserLabel(seed.assignedTo) : "",
          deputyId: seed.deputyId ? getUserLabel(seed.deputyId) : "",
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
      taskState,
      setTaskStatus
    }),
    [setTaskStatus, taskState, tasks]
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
