import React from "react";
import { t, I18nKey } from "../i18n";
import type { AuditLogEntry } from "../state/AuditLogStore";

function getActionLabel(action: AuditLogEntry["action"]) {
  if (action === "CREATED") {
    return t("audit.actions.created");
  }
  if (action === "UPDATED") {
    return t("audit.actions.updated");
  }
  if (action === "ARCHIVED") {
    return t("audit.actions.archived");
  }
  if (action === "RESTORED") {
    return t("audit.actions.restored");
  }
  if (action === "STATUS_CHANGED") {
    return t("audit.actions.statusChanged");
  }
  if (action === "EVIDENCE_ADDED") {
    return t("audit.actions.evidenceAdded");
  }
  if (action === "TASK_COMPLETED") {
    return t("audit.actions.taskCompleted");
  }
  if (action === "NOTIFICATION_DISMISSED") {
    return t("audit.actions.notificationDismissed");
  }
  if (action === "NOTIFICATION_SNOOZED") {
    return t("audit.actions.notificationSnoozed");
  }
  if (action === "AI_RUN_STARTED") {
    return t("audit.actions.aiRunStarted");
  }
  if (action === "AI_RUN_COMPLETED") {
    return t("audit.actions.aiRunCompleted");
  }
  if (action === "AI_FIELDS_APPLIED") {
    return t("audit.actions.aiFieldsApplied");
  }
  if (action === "AI_SUGGESTION_ACCEPTED") {
    return t("audit.actions.aiSuggestionAccepted");
  }
  if (action === "AI_SUGGESTION_REJECTED") {
    return t("audit.actions.aiSuggestionRejected");
  }
  return t("audit.actions.cleanup");
}

type AuditTimelineProps = {
  entries: AuditLogEntry[];
  emptyTextKey?: I18nKey;
};

export default function AuditTimeline({
  entries,
  emptyTextKey = "audit.empty"
}: AuditTimelineProps) {
  if (!entries.length) {
    return <p className="placeholderText">{t(emptyTextKey)}</p>;
  }

  return (
    <div className="timeline">
      {entries.map((entry) => (
        <div key={entry.id} className="timelineItem">
          <div className="metaLabel">{entry.at.slice(0, 16).replace("T", " ")}</div>
          <div className="metaValue">
            {entry.actorLabel} · {getActionLabel(entry.action)} · {entry.summary}
          </div>
        </div>
      ))}
    </div>
  );
}
