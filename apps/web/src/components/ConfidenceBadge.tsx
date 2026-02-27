import React from "react";
import { Badge } from "@nemetz/ui";
import { t } from "../i18n";
import { deriveConfidenceLevel } from "../services/aiResultValidation";
import type { AiConfidence, AiConfidenceLevel } from "../types/aiAnalysis";

type ConfidenceBadgeProps = {
  confidence?: AiConfidence;
};

const variantByLevel: Record<AiConfidenceLevel, "success" | "warning" | "danger" | "neutral"> = {
  HIGH: "success",
  MEDIUM: "warning",
  LOW: "danger",
  UNKNOWN: "neutral"
};

const labelByLevel: Record<AiConfidenceLevel, string> = {
  HIGH: t("ai.confidence.high"),
  MEDIUM: t("ai.confidence.medium"),
  LOW: t("ai.confidence.low"),
  UNKNOWN: t("ai.confidence.unknown")
};

function buildTitle(confidence?: AiConfidence) {
  if (!confidence) {
    return "";
  }

  const rows: string[] = [];
  if (typeof confidence.score === "number" && Number.isFinite(confidence.score)) {
    rows.push(`${t("ai.confidence.tooltipTitle")}: ${Math.round(confidence.score * 100)}%`);
  }
  if (confidence.note?.trim()) {
    rows.push(confidence.note.trim());
  }
  if (confidence.evidence?.length) {
    rows.push(confidence.evidence.join(" | "));
  }

  return rows.join("\n");
}

export default function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const level = deriveConfidenceLevel(confidence?.score, confidence?.level);
  const title = buildTitle(confidence);

  return (
    <Badge variant={variantByLevel[level]} title={title || undefined}>
      {labelByLevel[level]}
    </Badge>
  );
}
