export type Obligation = {
  id: string;
  legalDocId: string;
  title: string;
  infoTextLong?: string;
  level: "MANDATORY" | "RECOMMENDED";
  scheduleType: "ONCE" | "RECURRING" | "ONCE_THEN_RECURRING";
  firstDueDate?: string;
  intervalUnit?: "MONTH" | "YEAR";
  intervalValue?: number;
  ownerUserId?: string;
  deputyUserId?: string;
  criticality?: "LOW" | "MEDIUM" | "HIGH";
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
};

export const obligations: Obligation[] = [
  {
    id: "ob-001",
    legalDocId: "ld-001",
    title: "Monatliches Mengenreporting",
    infoTextLong: "Monatliche Meldung der Emissionsdaten inkl. Anlagenstatus und Filterwechsel.",
    level: "MANDATORY",
    scheduleType: "RECURRING",
    firstDueDate: "2026-03-15",
    intervalUnit: "MONTH",
    intervalValue: 1,
    ownerUserId: "u-001",
    deputyUserId: "u-006",
    criticality: "HIGH",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 7
  },
  {
    id: "ob-002",
    legalDocId: "ld-001",
    title: "Kontrollbuch fuehren",
    infoTextLong: "Das Kontrollbuch ist laufend zu aktualisieren und bei Behoerdenanfragen bereitzustellen.",
    level: "MANDATORY",
    scheduleType: "ONCE_THEN_RECURRING",
    firstDueDate: "2026-03-05",
    intervalUnit: "YEAR",
    intervalValue: 1,
    ownerUserId: "u-002",
    deputyUserId: "u-007",
    criticality: "MEDIUM",
    emailReminderEnabled: false
  },
  {
    id: "ob-003",
    legalDocId: "ld-002",
    title: "Quartalsmeldung Abfallmengen",
    infoTextLong: "Quartalsweise Meldung der Abfallmengen an die Behoerde.",
    level: "MANDATORY",
    scheduleType: "RECURRING",
    firstDueDate: "2026-04-05",
    intervalUnit: "MONTH",
    intervalValue: 3,
    ownerUserId: "u-003",
    deputyUserId: "u-008",
    criticality: "HIGH",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 14
  },
  {
    id: "ob-004",
    legalDocId: "ld-003",
    title: "Wartungsprotokoll Abscheider",
    infoTextLong: "Alle Wartungen sind zu dokumentieren und jährlich zusammenzufassen.",
    level: "RECOMMENDED",
    scheduleType: "ONCE",
    firstDueDate: "2026-04-10",
    ownerUserId: "u-005",
    deputyUserId: "u-009",
    criticality: "LOW",
    emailReminderEnabled: false
  }
];
