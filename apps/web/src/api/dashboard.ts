import { apiRequest } from "./client";

export type DashboardTaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "OVERDUE";
export type DashboardTaskType = "OBLIGATION" | "DEADLINE";
export type DashboardNotificationType = "REMINDER" | "OVERDUE";
export type DashboardNotificationEntityType = "TASK" | "DEADLINE";

export type DashboardTaskSummaryItem = {
  id: string;
  type: DashboardTaskType;
  title: string;
  dueDate: string;
  status: DashboardTaskStatus;
  assignedTo?: string;
  scopeLabel: string;
  projectId?: string;
  legalDocId?: string;
  obligationId?: string;
  deadlineId?: string;
};

export type DashboardNotificationSummaryItem = {
  id: string;
  type: DashboardNotificationType;
  entityType: DashboardNotificationEntityType;
  entityId: string;
  taskInstanceId?: string;
  title: string;
  dueDate: string;
  createdAt: string;
};

export type DashboardSummary = {
  generatedAt: string;
  range: {
    dueSoonDays: number;
    taskHorizonDays: number;
    completionWindowDays: number;
    limit: number;
  };
  stats: {
    openTasks: number;
    overdueTasks: number;
    tasksDueSoon: number;
    openDeadlines: number;
    overdueDeadlines: number;
    deadlinesDueSoon: number;
    openObligations: number;
    completionRatePercent: number;
  };
  overdueTasks: DashboardTaskSummaryItem[];
  notifications: DashboardNotificationSummaryItem[];
};

export async function getDashboardSummary(limit = 5) {
  return apiRequest<DashboardSummary>(`/dashboard/summary?limit=${encodeURIComponent(String(limit))}`);
}
