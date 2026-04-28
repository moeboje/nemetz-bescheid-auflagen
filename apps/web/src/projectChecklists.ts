import {
  CHECKLIST_ITEM_STATUS_VALUES,
  type ChecklistItemStatus,
  type ProjectChecklist
} from "./data/projectChecklists";
import type { I18nKey } from "./i18n";
import { t } from "./i18n";

const labelKeyByStatus: Record<ChecklistItemStatus, I18nKey> = {
  OPEN: "projects.checklist.status.open",
  IN_PROGRESS: "projects.checklist.status.inProgress",
  DONE: "projects.checklist.status.done",
  NOT_REQUIRED: "projects.checklist.status.notRequired"
};

function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowStamp() {
  return new Date().toISOString();
}

export function getChecklistItemStatusLabel(status: ChecklistItemStatus) {
  return t(labelKeyByStatus[status]);
}

export function getChecklistItemStatusOptions() {
  return CHECKLIST_ITEM_STATUS_VALUES.map((status) => ({
    value: status,
    label: getChecklistItemStatusLabel(status)
  }));
}

export function createEmptyProjectChecklist(projectId: string): ProjectChecklist {
  const now = nowStamp();
  return {
    id: createLocalId("pcl"),
    projectId,
    createdAt: now,
    updatedAt: now,
    sections: []
  };
}

export function createEmptyChecklistSection() {
  const now = nowStamp();
  return {
    id: createLocalId("pcs"),
    title: "",
    description: "",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    items: []
  };
}

export function createEmptyChecklistItem() {
  const now = nowStamp();
  return {
    id: createLocalId("pci"),
    title: "",
    description: "",
    status: "OPEN" as const,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeChecklistSortOrder(checklist: ProjectChecklist): ProjectChecklist {
  const now = nowStamp();

  return {
    ...checklist,
    updatedAt: now,
    sections: checklist.sections.map((section, sectionIndex) => ({
      ...section,
      sortOrder: sectionIndex,
      updatedAt: now,
      items: section.items.map((item, itemIndex) => ({
        ...item,
        sortOrder: itemIndex,
        updatedAt: now
      }))
    }))
  };
}

export function checklistHasEmptyTitles(checklist: ProjectChecklist | null) {
  if (!checklist) {
    return false;
  }

  return checklist.sections.some(
    (section) =>
      !section.title.trim() ||
      section.items.some((item) => !item.title.trim())
  );
}
