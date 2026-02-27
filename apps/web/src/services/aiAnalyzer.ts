import type { AiSuggestedObligation, LegalDocAiExtraction, LegalDocType } from "../data/legalDocs";
import { getRuntimeConfigSnapshot } from "../config/runtimeConfig";

type AnalyzeInput = {
  legalDocId: string;
  title: string;
  type: LegalDocType;
  reference?: string;
  issuedAt?: string;
  attachmentNames?: string[];
};

function slugSeed(input: AnalyzeInput) {
  const raw = `${input.legalDocId}:${input.title}:${input.type}:${input.attachmentNames?.join("|") ?? ""}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) % 100000;
  }
  return hash;
}

function buildSuggestions(type: LegalDocType, seed: number): AiSuggestedObligation[] {
  const baseDueMonth = (seed % 9) + 1;
  const dueDate = `2026-${String(baseDueMonth).padStart(2, "0")}-15`;

  if (type === "DECISION" || type === "PERMIT") {
    return [
      {
        id: `ai-s-${seed}-1`,
        title: "Jaehrliche Nachweispruefung fuer Genehmigungsauflagen",
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: dueDate,
        intervalUnit: "YEAR",
        intervalValue: 1,
        infoTextLong: "Automatisch vorgeschlagene Auflage aus Dokumentanalyse."
      },
      {
        id: `ai-s-${seed}-2`,
        title: "Quartalsweise interne Sichtkontrolle",
        level: "RECOMMENDED",
        scheduleType: "RECURRING",
        firstDueDate: dueDate,
        intervalUnit: "MONTH",
        intervalValue: 3
      }
    ];
  }

  if (type === "DIRECTIVE") {
    return [
      {
        id: `ai-s-${seed}-1`,
        title: "Monatliche Dokumentationskontrolle",
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: dueDate,
        intervalUnit: "MONTH",
        intervalValue: 1
      }
    ];
  }

  return [
    {
      id: `ai-s-${seed}-1`,
      title: "Einmalige fachliche Dokumentenpruefung",
      level: "RECOMMENDED",
      scheduleType: "ONCE",
      firstDueDate: dueDate
    }
  ];
}

export function analyzeLegalDoc(input: AnalyzeInput): LegalDocAiExtraction {
  const runtimeConfig = getRuntimeConfigSnapshot();
  const providerMode = runtimeConfig.ai?.provider ?? "disabled";
  const seed = slugSeed(input);
  const provider = providerMode === "azure" ? "AzureProxyPlaceholder" : "MockAI";
  const runId = `ai-run-${input.legalDocId}-${seed}`;

  return {
    status: "COMPLETED",
    provider,
    runId,
    extracted: {
      title: `${input.title}${seed % 2 === 0 ? "" : " (KI Vorschlag)"}`,
      shortDescription: `Auto-Zusammenfassung ${input.type.toLowerCase()} (${seed % 100}).`,
      reference: input.reference || `AI-${seed}`,
      issuedAt: input.issuedAt || "2026-02-01"
    },
    confidence: 0.65 + (seed % 25) / 100,
    suggestedObligations: buildSuggestions(input.type, seed),
    warnings: [
      ...(input.attachmentNames && input.attachmentNames.length === 0
        ? ["Keine Dateianhaenge vorhanden, Analyse basiert nur auf Metadaten."]
        : [])
    ]
  };
}
