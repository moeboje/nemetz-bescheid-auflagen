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
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const obligations: Obligation[] = [
  {
    id: "ob-001",
    legalDocId: "ld-001",
    title: "Jaehrliche Ueberpruefung der Loeschwasser-Rueckhaltung",
    infoTextLong:
      "Die Rueckhalteeinrichtungen sind mindestens einmal pro Jahr fachlich zu pruefen und nachvollziehbar zu dokumentieren.\nAbweichungen sind im internen Massnahmenprotokoll zu erfassen.",
    level: "MANDATORY",
    scheduleType: "RECURRING",
    firstDueDate: "2026-06-30",
    intervalUnit: "YEAR",
    intervalValue: 1,
    ownerUserId: "u-001",
    deputyUserId: "u-006",
    criticality: "HIGH",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 30,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-18T08:00:00.000Z"
  },
  {
    id: "ob-002",
    legalDocId: "ld-003",
    title: "Halbjaehrliche Wartung Oelabscheider inkl. Protokoll",
    infoTextLong:
      "Wartung und Funktionspruefung der Oelabscheider sind alle sechs Monate durchzufuehren.\nDie Protokolle muessen am Standort abrufbar sein und bei Pruefungen vorgelegt werden.",
    level: "MANDATORY",
    scheduleType: "RECURRING",
    firstDueDate: "2026-04-15",
    intervalUnit: "MONTH",
    intervalValue: 6,
    ownerUserId: "u-002",
    deputyUserId: "u-007",
    criticality: "MEDIUM",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 14,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-17T08:00:00.000Z"
  },
  {
    id: "ob-003",
    legalDocId: "ld-002",
    title: "Monatliche Sichtkontrolle der Lagerflaechen (gefaehrliche Abfaelle)",
    infoTextLong:
      "Lagerflaechen fuer gefaehrliche Abfaelle sind monatlich visuell zu kontrollieren.\nFeststellungen und Sofortmassnahmen sind in der Standortdokumentation zu vermerken.",
    level: "MANDATORY",
    scheduleType: "RECURRING",
    firstDueDate: "2026-03-15",
    intervalUnit: "MONTH",
    intervalValue: 1,
    ownerUserId: "u-003",
    deputyUserId: "u-008",
    criticality: "HIGH",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 7,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-16T08:00:00.000Z"
  },
  {
    id: "ob-004",
    legalDocId: "ld-003",
    title: "Schulung Gefahrgut/Gefahrstoffe fuer definierte Rollen (jaehrlich)",
    infoTextLong:
      "Mitarbeitende in definierten Rollen sind einmal pro Jahr zu Gefahrgut- und Gefahrstoffthemen zu schulen.\nDie Teilnahme ist mit Schulungsnachweisen zu dokumentieren.",
    level: "MANDATORY",
    scheduleType: "RECURRING",
    firstDueDate: "2026-09-30",
    intervalUnit: "YEAR",
    intervalValue: 1,
    ownerUserId: "u-005",
    deputyUserId: "u-009",
    criticality: "HIGH",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 30,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-15T08:00:00.000Z"
  },
  {
    id: "ob-005",
    legalDocId: "ld-001",
    title: "Jaehrlicher Emissions-/Staubbericht (wenn zutreffend)",
    infoTextLong:
      "Sofern emissionsrelevante Prozesse betrieben werden, ist jaehrlich ein zusammenfassender Bericht zu erstellen.\nDer Bericht beinhaltet Messdaten, Abweichungen und eingeleitete Verbesserungsmassnahmen.",
    level: "RECOMMENDED",
    scheduleType: "RECURRING",
    firstDueDate: "2026-12-15",
    intervalUnit: "YEAR",
    intervalValue: 1,
    ownerUserId: "u-001",
    deputyUserId: "u-006",
    criticality: "LOW",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 14,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-14T08:00:00.000Z"
  }
];
