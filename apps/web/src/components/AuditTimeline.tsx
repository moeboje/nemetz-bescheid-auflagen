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
