import React from "react";
import { Badge, Button, Card, Input, Select } from "@nemetz/ui";
import { ApiError } from "../api/client";
import {
  deleteProjectChecklist,
  getProjectChecklist,
  saveProjectChecklist
} from "../api/projectChecklists";
import type {
  ChecklistItemStatus,
  ProjectChecklist
} from "../data/projectChecklists";
import { t } from "../i18n";
import { useAuditLog } from "../state/AuditLogStore";
import {
  checklistHasEmptyTitles,
  createEmptyChecklistItem,
  createEmptyChecklistSection,
  createEmptyProjectChecklist,
  getChecklistItemStatusLabel,
  getChecklistItemStatusOptions,
  normalizeChecklistSortOrder
} from "../projectChecklists";

type ProjectChecklistTabProps = {
  projectId: string;
  canEdit: boolean;
  projectTitle: string;
};

function cloneChecklist(checklist: ProjectChecklist | null) {
  if (!checklist) {
    return null;
  }

  return JSON.parse(JSON.stringify(checklist)) as ProjectChecklist;
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function formatApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return t("projects.checklist.errorGeneric");
}

export default function ProjectChecklistTab({
  projectId,
  canEdit,
  projectTitle
}: ProjectChecklistTabProps) {
  const { logEvent } = useAuditLog();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [serverChecklist, setServerChecklist] = React.useState<ProjectChecklist | null>(null);
  const [draftChecklist, setDraftChecklist] = React.useState<ProjectChecklist | null>(null);
  const [collapsedSectionIds, setCollapsedSectionIds] = React.useState<string[]>([]);
  const [hideDoneItems, setHideDoneItems] = React.useState(false);
  const statusOptions = React.useMemo(() => getChecklistItemStatusOptions(), []);

  const loadChecklist = React.useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const checklist = await getProjectChecklist(projectId);
      const cloned = cloneChecklist(checklist);
      setServerChecklist(cloned);
      setDraftChecklist(cloned);
      setCollapsedSectionIds([]);
    } catch (error) {
      setErrorMessage(formatApiError(error));
      setServerChecklist(null);
      setDraftChecklist(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void loadChecklist();
  }, [loadChecklist]);

  const checklist = draftChecklist;
  const hasValidationErrors = checklistHasEmptyTitles(checklist);
  const isDirty = JSON.stringify(serverChecklist) !== JSON.stringify(draftChecklist);

  const totalCounts = React.useMemo(() => {
    const counts: Record<ChecklistItemStatus, number> = {
      OPEN: 0,
      IN_PROGRESS: 0,
      DONE: 0,
      NOT_REQUIRED: 0
    };

    checklist?.sections.forEach((section) => {
      section.items.forEach((item) => {
        counts[item.status] += 1;
      });
    });

    return counts;
  }, [checklist]);

  const updateChecklist = React.useCallback(
    (updater: (current: ProjectChecklist) => ProjectChecklist) => {
      setDraftChecklist((current) => {
        if (!current) {
          return current;
        }
        return normalizeChecklistSortOrder(updater(current));
      });
    },
    []
  );

  const handleCreateChecklist = async () => {
    if (!canEdit) {
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const created = await saveProjectChecklist(projectId, createEmptyProjectChecklist(projectId));
      const cloned = cloneChecklist(created);
      setServerChecklist(cloned);
      setDraftChecklist(cloned);
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: projectId,
        action: "UPDATED",
        summary: `${projectTitle}: Checkliste angelegt`
      });
    } catch (error) {
      setErrorMessage(formatApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!checklist || !canEdit || hasValidationErrors) {
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const saved = await saveProjectChecklist(projectId, normalizeChecklistSortOrder(checklist));
      const cloned = cloneChecklist(saved);
      setServerChecklist(cloned);
      setDraftChecklist(cloned);
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: projectId,
        action: "UPDATED",
        summary: `${projectTitle}: Checkliste aktualisiert`
      });
    } catch (error) {
      setErrorMessage(formatApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit || !checklist) {
      return;
    }

    if (typeof window !== "undefined" && !window.confirm(t("projects.checklist.confirmDelete"))) {
      return;
    }

    setDeleting(true);
    setErrorMessage("");

    try {
      await deleteProjectChecklist(projectId);
      setServerChecklist(null);
      setDraftChecklist(null);
      setCollapsedSectionIds([]);
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: projectId,
        action: "UPDATED",
        summary: `${projectTitle}: Checkliste entfernt`
      });
    } catch (error) {
      setErrorMessage(formatApiError(error));
    } finally {
      setDeleting(false);
    }
  };

  const toggleSectionCollapsed = (sectionId: string) => {
    setCollapsedSectionIds((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId]
    );
  };

  const addSection = () => {
    updateChecklist((current) => ({
      ...current,
      sections: [...current.sections, createEmptyChecklistSection()]
    }));
  };

  const removeSection = (sectionId: string) => {
    updateChecklist((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.id !== sectionId)
    }));
    setCollapsedSectionIds((current) => current.filter((id) => id !== sectionId));
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    updateChecklist((current) => {
      const index = current.sections.findIndex((section) => section.id === sectionId);
      return {
        ...current,
        sections: moveArrayItem(current.sections, index, index + direction)
      };
    });
  };

  const updateSectionField = (
    sectionId: string,
    field: "title" | "description",
    value: string
  ) => {
    updateChecklist((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, [field]: value } : section
      )
    }));
  };

  const addItem = (sectionId: string) => {
    updateChecklist((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: [...section.items, createEmptyChecklistItem()]
            }
          : section
      )
    }));
  };

  const removeItem = (sectionId: string, itemId: string) => {
    updateChecklist((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.filter((item) => item.id !== itemId)
            }
          : section
      )
    }));
  };

  const moveItem = (sectionId: string, itemId: string, direction: -1 | 1) => {
    updateChecklist((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        const index = section.items.findIndex((item) => item.id === itemId);
        return {
          ...section,
          items: moveArrayItem(section.items, index, index + direction)
        };
      })
    }));
  };

  const updateItemField = (
    sectionId: string,
    itemId: string,
    field: "title" | "description" | "status",
    value: string
  ) => {
    updateChecklist((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      [field]: value
                    }
                  : item
              )
            }
          : section
      )
    }));
  };

  if (loading) {
    return (
      <Card>
        <p className="placeholderText">{t("projects.checklist.loading")}</p>
      </Card>
    );
  }

  if (!checklist) {
    return (
      <Card>
        <div className="projectChecklistEmptyState">
          <p className="placeholderText">{t("projects.checklist.empty")}</p>
          {errorMessage ? <p className="projectChecklistError">{errorMessage}</p> : null}
          {canEdit ? (
            <Button onClick={() => void handleCreateChecklist()} disabled={saving}>
              {t("projects.checklist.create")}
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <div className="projectChecklistLayout">
      <Card>
        <div className="projectChecklistHeader">
          <div className="projectChecklistHeaderMeta">
            <div className="inlineMeta">
              <Badge variant="neutral">
                {t("projects.checklist.sectionsCount").replace(
                  "{count}",
                  String(checklist.sections.length)
                )}
              </Badge>
              {statusOptions.map((option) => (
                <Badge key={option.value} variant={option.value === "DONE" ? "success" : "neutral"}>
                  {option.label}: {totalCounts[option.value as ChecklistItemStatus]}
                </Badge>
              ))}
            </div>
            {hasValidationErrors ? (
              <p className="projectChecklistError">
                {t("projects.checklist.validationMissingTitles")}
              </p>
            ) : null}
            {errorMessage ? <p className="projectChecklistError">{errorMessage}</p> : null}
          </div>
          <div className="projectChecklistHeaderActions">
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={hideDoneItems}
                onChange={(event) => setHideDoneItems(event.target.checked)}
              />
              <span>{t("projects.checklist.hideDone")}</span>
            </label>
            {canEdit ? (
              <>
                <Button variant="secondary" onClick={addSection} disabled={saving || deleting}>
                  {t("projects.checklist.addSection")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setDraftChecklist(cloneChecklist(serverChecklist))}
                  disabled={!isDirty || saving || deleting}
                >
                  {t("projects.checklist.resetChanges")}
                </Button>
                <Button onClick={() => void handleSave()} disabled={!isDirty || hasValidationErrors || saving || deleting}>
                  {saving ? t("projects.checklist.saving") : t("projects.checklist.save")}
                </Button>
                <Button variant="secondary" onClick={() => void handleDelete()} disabled={saving || deleting}>
                  {deleting ? t("projects.checklist.deleting") : t("projects.checklist.delete")}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </Card>

      {checklist.sections.length === 0 ? (
        <Card>
          <p className="placeholderText">{t("projects.checklist.emptySections")}</p>
        </Card>
      ) : null}

      {checklist.sections.map((section, sectionIndex) => {
        const isCollapsed = collapsedSectionIds.includes(section.id);
        const sectionCounts: Record<ChecklistItemStatus, number> = {
          OPEN: 0,
          IN_PROGRESS: 0,
          DONE: 0,
          NOT_REQUIRED: 0
        };
        section.items.forEach((item) => {
          sectionCounts[item.status] += 1;
        });
        const visibleItems = hideDoneItems
          ? section.items.filter((item) => item.status !== "DONE")
          : section.items;

        return (
          <Card key={section.id}>
            <div className="projectChecklistSectionHeader">
              <div className="projectChecklistSectionHeaderMain">
                <div className="projectChecklistSectionTitleRow">
                  {canEdit ? (
                    <Input
                      value={section.title}
                      onChange={(event) =>
                        updateSectionField(section.id, "title", event.target.value)
                      }
                      placeholder={t("projects.checklist.sectionTitlePlaceholder")}
                    />
                  ) : (
                    <h2 className="sectionTitle">{section.title}</h2>
                  )}
                  <Button variant="secondary" onClick={() => toggleSectionCollapsed(section.id)}>
                    {isCollapsed
                      ? t("projects.checklist.expandSection")
                      : t("projects.checklist.collapseSection")}
                  </Button>
                </div>
                <div className="inlineMeta">
                  {statusOptions.map((option) => (
                    <Badge key={option.value} variant={option.value === "DONE" ? "success" : "neutral"}>
                      {getChecklistItemStatusLabel(option.value as ChecklistItemStatus)}:{" "}
                      {sectionCounts[option.value as ChecklistItemStatus]}
                    </Badge>
                  ))}
                </div>
              </div>
              {canEdit ? (
                <div className="projectChecklistSectionActions">
                  <Button
                    variant="secondary"
                    onClick={() => moveSection(section.id, -1)}
                    disabled={sectionIndex === 0}
                  >
                    {t("projects.checklist.moveUp")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => moveSection(section.id, 1)}
                    disabled={sectionIndex === checklist.sections.length - 1}
                  >
                    {t("projects.checklist.moveDown")}
                  </Button>
                  <Button variant="secondary" onClick={() => addItem(section.id)}>
                    {t("projects.checklist.addItem")}
                  </Button>
                  <Button variant="secondary" onClick={() => removeSection(section.id)}>
                    {t("projects.checklist.deleteSection")}
                  </Button>
                </div>
              ) : null}
            </div>

            {!isCollapsed ? (
              <div className="projectChecklistSectionBody">
                <div className="formField">
                  <span className="fieldLabel">{t("projects.checklist.sectionDescription")}</span>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={section.description ?? ""}
                    disabled={!canEdit}
                    placeholder={t("projects.checklist.sectionDescriptionPlaceholder")}
                    onChange={(event) =>
                      updateSectionField(section.id, "description", event.target.value)
                    }
                  />
                </div>

                {visibleItems.length === 0 ? (
                  <p className="placeholderText">{t("projects.checklist.emptyItems")}</p>
                ) : (
                  <div className="projectChecklistItemsList">
                    {visibleItems.map((item, itemIndex) => (
                      <div key={item.id} className="projectChecklistItemCard">
                        <div className="projectChecklistItemHeader">
                          <div className="projectChecklistItemFields">
                            <div className="formField">
                              <span className="fieldLabel">{t("projects.checklist.itemTitle")}</span>
                              <Input
                                value={item.title}
                                disabled={!canEdit}
                                placeholder={t("projects.checklist.itemTitlePlaceholder")}
                                onChange={(event) =>
                                  updateItemField(section.id, item.id, "title", event.target.value)
                                }
                              />
                            </div>
                            <div className="formField">
                              <span className="fieldLabel">{t("projects.checklist.itemStatus")}</span>
                              <Select
                                options={statusOptions}
                                value={item.status}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  updateItemField(
                                    section.id,
                                    item.id,
                                    "status",
                                    event.target.value
                                  )
                                }
                              />
                            </div>
                          </div>
                          {canEdit ? (
                            <div className="projectChecklistItemActions">
                              <Button
                                variant="secondary"
                                onClick={() => moveItem(section.id, item.id, -1)}
                                disabled={itemIndex === 0}
                              >
                                {t("projects.checklist.moveUp")}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => moveItem(section.id, item.id, 1)}
                                disabled={itemIndex === visibleItems.length - 1}
                              >
                                {t("projects.checklist.moveDown")}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => removeItem(section.id, item.id)}
                              >
                                {t("projects.checklist.deleteItem")}
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        <div className="formField">
                          <span className="fieldLabel">{t("projects.checklist.itemDescription")}</span>
                          <textarea
                            className="textarea"
                            rows={2}
                            value={item.description ?? ""}
                            disabled={!canEdit}
                            placeholder={t("projects.checklist.itemDescriptionPlaceholder")}
                            onChange={(event) =>
                              updateItemField(
                                section.id,
                                item.id,
                                "description",
                                event.target.value
                              )
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
