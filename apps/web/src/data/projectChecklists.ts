export const CHECKLIST_ITEM_STATUS_VALUES = [
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "NOT_REQUIRED"
] as const;

export type ChecklistItemStatus = (typeof CHECKLIST_ITEM_STATUS_VALUES)[number];

export type ProjectChecklistItem = {
  id: string;
  title: string;
  description?: string;
  status: ChecklistItemStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectChecklistSection = {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: ProjectChecklistItem[];
};

export type ProjectChecklist = {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  sections: ProjectChecklistSection[];
};
