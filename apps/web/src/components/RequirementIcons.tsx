import React from "react";
import type { ObligationEvidenceRequirements } from "../data/obligations";
import { t } from "../i18n";
import styles from "./miniPills.module.css";

type RequirementIconsProps = {
  requirements: ObligationEvidenceRequirements;
  size?: "sm" | "md";
};

type IconProps = {
  className?: string;
};

type RequirementItem = {
  key: "photo" | "document" | "report";
  label: string;
  Icon: (props: IconProps) => React.JSX.Element;
};

function CameraMiniIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 8h3l1.4-2h5.2L16 8h3a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1V9a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function DocumentMiniIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 3h8l4 4v14H7V3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 3v5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 12h6M10 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ReportMiniIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 4h6l1.5 2H19a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h2.5L9 4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function getItems(requirements: ObligationEvidenceRequirements): RequirementItem[] {
  const items: RequirementItem[] = [];

  if (requirements.requirePhoto) {
    items.push({
      key: "photo",
      label: t("obligations.evidence.photoRequired"),
      Icon: CameraMiniIcon
    });
  }

  if (requirements.requireDocument) {
    items.push({
      key: "document",
      label: t("obligations.evidence.documentRequired"),
      Icon: DocumentMiniIcon
    });
  }

  if (requirements.requireReport) {
    items.push({
      key: "report",
      label: t("obligations.evidence.reportRequired"),
      Icon: ReportMiniIcon
    });
  }

  return items;
}

export default function RequirementIcons({ requirements, size = "sm" }: RequirementIconsProps) {
  const items = getItems(requirements);
  const sizeClass = size === "md" ? styles.pillMd : styles.pillSm;
  const dashSizeClass = size === "md" ? styles.dashMd : styles.dashSm;

  if (!items.length) {
    const noneLabel = t("obligations.evidence.noneRequired");
    return (
      <span
        className={`${styles.dash} ${dashSizeClass}`}
        role="img"
        aria-label={noneLabel}
        title={noneLabel}
      >
        {t("common.dash")}
      </span>
    );
  }

  return (
    <span className={styles.container}>
      {items.map(({ key, label, Icon }) => (
        <span
          key={key}
          className={`${styles.pill} ${sizeClass}`}
          role="img"
          aria-label={label}
          title={label}
        >
          <Icon className={styles.icon} />
        </span>
      ))}
    </span>
  );
}
