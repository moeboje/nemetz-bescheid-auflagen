import React from "react";
import { t } from "../i18n";
import styles from "./miniPills.module.css";

type EmailReminderCompactProps = {
  enabled: boolean;
  daysBefore?: number | null;
  size?: "sm" | "md";
};

type IconProps = {
  className?: string;
};

function MailMiniIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 7h16v10H4V7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 8l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatTemplate(template: string, replacements: Record<string, string | number>) {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template
  );
}

function normalizeDays(daysBefore?: number | null) {
  if (typeof daysBefore !== "number" || !Number.isFinite(daysBefore)) {
    return 7;
  }

  return Math.max(0, Math.round(daysBefore));
}

export default function EmailReminderCompact({
  enabled,
  daysBefore,
  size = "sm"
}: EmailReminderCompactProps) {
  const sizeClass = size === "md" ? styles.pillMd : styles.pillSm;
  const dashSizeClass = size === "md" ? styles.dashMd : styles.dashSm;

  if (!enabled) {
    const noneLabel = t("obligations.reminder.none");
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

  const days = normalizeDays(daysBefore);
  const shortLabel = formatTemplate(t("obligations.reminder.emailShort"), { days });
  const longLabel =
    days === 0
      ? `${t("obligations.reminder.email")}: ${t("common.onDueDate")}`
      : formatTemplate(t("obligations.reminder.emailLong"), { days });

  return (
    <span className={`${styles.pill} ${sizeClass}`} role="img" aria-label={longLabel} title={longLabel}>
      <MailMiniIcon className={styles.icon} />
      <span className={styles.label}>{shortLabel}</span>
    </span>
  );
}
