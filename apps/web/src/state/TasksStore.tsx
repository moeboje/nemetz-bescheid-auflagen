import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useDeadlines } from "./DeadlinesStore";
import { useAuthorization } from "./AuthorizationStore";
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
import {
  addDateOnlyDays,
  addDateOnlyInterval,
  normalizeDateOnly,
  todayDateOnlyLocal
} from "../utils/dateOnly";

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
  projectCanWrite?: boolean;
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
  return todayDateOnlyLocal();
}

function addInterval(
  dateOnly: string,
  unit: NonNullable<Obligation["intervalUnit"]>,
  value: number
) {
  return addDateOnlyInterval(dateOnly, unit, value);
}

function addDays(dateOnly: string, days: number) {
  return addDateOnlyDays(dateOnly, days);
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
  const today = todayStamp();
  const horizonEnd = addDays(today, horizonDays) ?? today;

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

      const startDate = obligation.firstDueDate
        ? normalizeDateOnly(obligation.firstDueDate)
        : today;
      if (!startDate) {
        return;
      }
      const recurrenceEndDate = obligation.recurrenceEndDate
        ? normalizeDateOnly(obligation.recurrenceEndDate)
        : undefined;
      if (obligation.recurrenceEndDate && !recurrenceEndDate) {
        return;
      }
      const effectiveHorizonEnd =
        recurrenceEndDate && recurrenceEndDate < horizonEnd ? recurrenceEndDate : horizonEnd;

      let cursor = startDate;

      if (obligation.scheduleType === "ONCE_THEN_RECURRING") {
        if (!obligation.firstDueDate) {
          return;
        }
        if (!recurrenceEndDate || startDate <= recurrenceEndDate) {
          createSeed(startDate);
        }
        const nextCursor = addInterval(startDate, unit, value);
        if (!nextCursor || nextCursor <= startDate) {
          return;
        }
        cursor = nextCursor;
      }

      while (cursor <= effectiveHorizonEnd) {
        createSeed(cursor);
        const nextCursor = addInterval(cursor, unit, value);
        if (!nextCursor || nextCursor <= cursor) {
          break;
        }
        cursor = nextCursor;
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
      projectId: deadline.resolvedProjectId ?? deadline.projectId,
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
  ) => Promise<void>;
  reopenTask: (taskId: string) => void;
};

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { permissions } = useAuthorization();
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
      if (!permissions.canViewTasks) {
        return;
      }
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
    [markDeadlineDone, permissions.canViewTasks, reopenDeadline, setObligationTaskStatus]
  );

  const markTaskDone = useCallback(
    (taskId: string) => setTaskStatus(taskId, "DONE"),
    [setTaskStatus]
  );

  const markTaskDoneWithEvidence = useCallback(
    async (
      taskId: string,
      input: { note?: string; outcome?: EvidenceOutcome; attachments: AttachmentMeta[] }
    ) => {
      if (!permissions.canViewTasks) {
        return;
      }
      const deadlineId = parseDeadlineTaskId(taskId);
      if (deadlineId) {
        await markDeadlineDoneWithEvidence(deadlineId, input);
        return;
      }
      await markObligationDoneWithEvidence(taskId, input);
    },
    [markDeadlineDoneWithEvidence, markObligationDoneWithEvidence, permissions.canViewTasks]
  );

  const reopenTask = useCallback(
    (taskId: string) => setTaskStatus(taskId, "OPEN"),
    [setTaskStatus]
  );

  const tasks = useMemo<Task[]>(() => {
    if (!permissions.canViewTasks) {
      return [];
    }

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
        let projectCanWrite = false;

        if (seed.type === "OBLIGATION") {
          const doc = legalDocs.find((item) => item.id === seed.legalDocId);
          const obligation = obligations.find((item) => item.id === seed.obligationId);
          legalDocId = doc?.id;
          projectId = obligation?.projectId ?? doc?.projectId;
          projectCanWrite = Boolean(
            obligation?.currentUserCanWriteProject ?? doc?.currentUserCanWriteProject
          );
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
          projectId = deadline?.resolvedProjectId ?? deadline?.projectId ?? projectId;
          projectCanWrite = Boolean(deadline?.currentUserCanWriteProject);

          if (legalDocId) {
            const doc = legalDocs.find((item) => item.id === legalDocId);
            if (doc) {
              projectId = projectId ?? doc.projectId;
              projectCanWrite = projectCanWrite || Boolean(doc.currentUserCanWriteProject);
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
          legalDocId,
          projectCanWrite
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
    permissions.canViewTasks,
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
