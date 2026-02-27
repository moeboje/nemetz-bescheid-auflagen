import React from "react";
import type { ObligationEvidenceRequirements } from "../data/obligations";
import { t } from "../i18n";
import styles from "./miniPills.module.css";

type RequirementChipsProps = {
  requirements: ObligationEvidenceRequirements;
  size?: "sm" | "md";
  showNoneText?: boolean;
};

function getRequirementLabels(requirements: ObligationEvidenceRequirements) {
  const labels: string[] = [];

  if (requirements.requirePhoto) {
    labels.push(t("obligations.evidence.photoRequired"));
  }
  if (requirements.requireDocument) {
    labels.push(t("obligations.evidence.documentRequired"));
  }
  if (requirements.requireReport) {
    labels.push(t("obligations.evidence.reportRequired"));
  }

  return labels;
}

export default function RequirementChips({
  requirements,
  size = "sm",
  showNoneText = true
}: RequirementChipsProps) {
  const labels = getRequirementLabels(requirements);
  const sizeClass = size === "md" ? styles.pillMd : styles.pillSm;

  if (!labels.length) {
    return showNoneText ? <span className={styles.noneText}>{t("obligations.evidence.noneRequired")}</span> : null;
  }

  return (
    <span className={styles.container}>
      {labels.map((label) => (
        <span key={label} className={`${styles.pill} ${sizeClass}`} title={label}>
          {label}
        </span>
      ))}
    </span>
  );
}
