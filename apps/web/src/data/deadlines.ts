export type DeadlineStatus = "OPEN" | "DONE" | "OVERDUE";
export type DeadlineStoredStatus = Exclude<DeadlineStatus, "OVERDUE">;

export type Deadline = {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  status: DeadlineStoredStatus;
  projectId?: string;
  legalDocId?: string;
  authorityId?: string;
  ownerUserId?: string;
  deputyUserId?: string;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const deadlines: Deadline[] = [
  {
    id: "dl-001",
    title: "Stellungnahme an Behoerde - Rueckfrage zu Unterlagen",
    description: "Rueckfrage zu Unterlagen fachlich beantworten und fristgerecht uebermitteln.",
    dueDate: "2026-03-01",
    status: "OPEN",
    projectId: "p-001",
    legalDocId: "ld-001",
    authorityId: "auth-001",
    ownerUserId: "u-001",
    deputyUserId: "u-006",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 7,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-18T08:00:00.000Z"
  },
  {
    id: "dl-002",
    title: "Nachreichung Pruefbericht",
    description: "Pruefbericht fuer Zwischenlagerflaeche nachreichen und intern dokumentieren.",
    dueDate: "2026-03-20",
    status: "OPEN",
    projectId: "p-002",
    legalDocId: "ld-004",
    authorityId: "auth-002",
    ownerUserId: "u-003",
    deputyUserId: "u-008",
    emailReminderEnabled: true,
    emailReminderDaysBefore: 14,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-19T08:00:00.000Z"
  },
  {
    id: "dl-003",
    title: "Einspruchsfrist / Beschwerdefrist (Demo)",
    description: "Frist fuer allfaellige Rechtsmittel pruefen und fristgerecht entscheiden.",
    dueDate: "2026-04-02",
    status: "OPEN",
    projectId: "p-003",
    legalDocId: "ld-003",
    authorityId: "auth-001",
    ownerUserId: "u-005",
    deputyUserId: "u-009",
    emailReminderEnabled: false,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-20T08:00:00.000Z"
  }
];
