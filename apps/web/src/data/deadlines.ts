export type DeadlineStatus = "OPEN" | "DONE" | "OVERDUE";

export type Deadline = {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  status: DeadlineStatus;
  projectId?: string;
  legalDocId?: string;
  authorityId?: string;
  ownerUserId?: string;
  deputyUserId?: string;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
};

export const deadlines: Deadline[] = [
  {
    id: "dl-001",
    title: "Abgabe Umweltbericht",
    description: "Jaehrlicher Bericht fuer die Emissionsdaten und Betriebskennzahlen.",
    dueDate: "2026-03-01",
    status: "OPEN",
    projectId: "p-001",
    legalDocId: "ld-001",
    authorityId: "auth-001",
    ownerUserId: "u-001",
    deputyUserId: "u-006",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 7
  },
  {
    id: "dl-002",
    title: "Quartalsnachweis Entsorgung",
    description: "Mengen- und Entsorgungsnachweis fuer Q1 einreichen.",
    dueDate: "2026-03-20",
    status: "OPEN",
    projectId: "p-002",
    legalDocId: "ld-002",
    authorityId: "auth-002",
    ownerUserId: "u-003",
    deputyUserId: "u-008",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 14
  },
  {
    id: "dl-003",
    title: "Wartungsnachweis Tanklager",
    description: "Jahresnachweis Wartung inklusive Pruefprotokolle.",
    dueDate: "2026-04-02",
    status: "OPEN",
    projectId: "p-003",
    legalDocId: "ld-003",
    authorityId: "auth-001",
    ownerUserId: "u-005",
    deputyUserId: "u-009",
    emailReminderEnabled: false
  }
];
