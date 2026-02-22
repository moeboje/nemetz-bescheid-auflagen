export type TaskType = "OBLIGATION" | "DEADLINE";
export type ObligationLevel = "MANDATORY" | "RECOMMENDED";
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "OVERDUE";
export type TaskScope = "COMPANY" | "SITE" | "FACILITY";
export type TaskCriticality = "LOW" | "MEDIUM" | "HIGH";

export type Task = {
  id: string;
  title: string;
  type: TaskType;
  obligationLevel: ObligationLevel;
  dueDate: string;
  status: TaskStatus;
  assignee: string;
  deputy: string;
  scope: TaskScope;
  criticality: TaskCriticality;
};

export type TaskDetail = {
  attachments: string[];
  history: Array<{ date: string; text: string }>;
};

export const tasks: Task[] = [
  {
    id: "t-001",
    title: "Filterwechsel Dokumentation",
    type: "OBLIGATION",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-04",
    status: "OPEN",
    assignee: "Lena Hofer",
    deputy: "Markus Leitner",
    scope: "FACILITY",
    criticality: "HIGH"
  },
  {
    id: "t-002",
    title: "Quartalsbericht Abfallmengen",
    type: "DEADLINE",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-10",
    status: "IN_PROGRESS",
    assignee: "Mario Prammer",
    deputy: "Sabrina Wolf",
    scope: "COMPANY",
    criticality: "HIGH"
  },
  {
    id: "t-003",
    title: "Sicherheitsunterweisung Team",
    type: "OBLIGATION",
    obligationLevel: "RECOMMENDED",
    dueDate: "2026-03-18",
    status: "OPEN",
    assignee: "Fatma Yilmaz",
    deputy: "Julia Kern",
    scope: "SITE",
    criticality: "MEDIUM"
  },
  {
    id: "t-004",
    title: "Nachweis Lagerstand Pruefung",
    type: "OBLIGATION",
    obligationLevel: "MANDATORY",
    dueDate: "2026-02-28",
    status: "OVERDUE",
    assignee: "Andreas Habison",
    deputy: "Peter Novak",
    scope: "FACILITY",
    criticality: "HIGH"
  },
  {
    id: "t-005",
    title: "Audit Vorbereitung",
    type: "DEADLINE",
    obligationLevel: "RECOMMENDED",
    dueDate: "2026-04-05",
    status: "OPEN",
    assignee: "Katharina Stein",
    deputy: "Oliver Brugger",
    scope: "COMPANY",
    criticality: "MEDIUM"
  },
  {
    id: "t-006",
    title: "Anlagenwartung Checkliste",
    type: "OBLIGATION",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-22",
    status: "IN_PROGRESS",
    assignee: "Roman Aigner",
    deputy: "David Kern",
    scope: "FACILITY",
    criticality: "HIGH"
  },
  {
    id: "t-007",
    title: "Meldung an Behoerde",
    type: "DEADLINE",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-01",
    status: "OVERDUE",
    assignee: "Lisa Berger",
    deputy: "Simon Kurz",
    scope: "COMPANY",
    criticality: "HIGH"
  },
  {
    id: "t-008",
    title: "Schulung Dokumentationspflicht",
    type: "OBLIGATION",
    obligationLevel: "RECOMMENDED",
    dueDate: "2026-04-12",
    status: "OPEN",
    assignee: "Pauline Huber",
    deputy: "Niklas Adler",
    scope: "SITE",
    criticality: "LOW"
  },
  {
    id: "t-009",
    title: "EWP Statistik Update",
    type: "DEADLINE",
    obligationLevel: "RECOMMENDED",
    dueDate: "2026-03-15",
    status: "IN_PROGRESS",
    assignee: "Tobias Lang",
    deputy: "Lukas Jansen",
    scope: "COMPANY",
    criticality: "MEDIUM"
  },
  {
    id: "t-010",
    title: "Pruefprotokoll Generator",
    type: "OBLIGATION",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-20",
    status: "OPEN",
    assignee: "Nora Weiss",
    deputy: "Elena Moser",
    scope: "FACILITY",
    criticality: "MEDIUM"
  },
  {
    id: "t-011",
    title: "Update Betriebsanweisung",
    type: "OBLIGATION",
    obligationLevel: "RECOMMENDED",
    dueDate: "2026-04-01",
    status: "DONE",
    assignee: "Max Steiner",
    deputy: "Maria Leitner",
    scope: "SITE",
    criticality: "LOW"
  },
  {
    id: "t-012",
    title: "Abfallbilanz Freigabe",
    type: "DEADLINE",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-27",
    status: "IN_PROGRESS",
    assignee: "Florian Dietrich",
    deputy: "Sandra Kopp",
    scope: "COMPANY",
    criticality: "HIGH"
  },
  {
    id: "t-013",
    title: "Mitarbeiterrolle Update",
    type: "OBLIGATION",
    obligationLevel: "RECOMMENDED",
    dueDate: "2026-04-08",
    status: "OPEN",
    assignee: "Helena Graf",
    deputy: "Mirko Haas",
    scope: "SITE",
    criticality: "LOW"
  },
  {
    id: "t-014",
    title: "Bescheid Archivierung",
    type: "DEADLINE",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-12",
    status: "IN_PROGRESS",
    assignee: "Iris Brandt",
    deputy: "Daniel Weiss",
    scope: "COMPANY",
    criticality: "MEDIUM"
  },
  {
    id: "t-015",
    title: "Messprotokoll Upload",
    type: "OBLIGATION",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-05",
    status: "OVERDUE",
    assignee: "Emil Maurer",
    deputy: "Hanna Wolff",
    scope: "FACILITY",
    criticality: "HIGH"
  },
  {
    id: "t-016",
    title: "Rechtsdokument Pruefung",
    type: "OBLIGATION",
    obligationLevel: "RECOMMENDED",
    dueDate: "2026-04-20",
    status: "OPEN",
    assignee: "Aylin Koc",
    deputy: "Robert Koller",
    scope: "SITE",
    criticality: "MEDIUM"
  },
  {
    id: "t-017",
    title: "Fristenkontrolle",
    type: "DEADLINE",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-02",
    status: "OVERDUE",
    assignee: "Dominik Fuchs",
    deputy: "Clara Mayer",
    scope: "COMPANY",
    criticality: "HIGH"
  },
  {
    id: "t-018",
    title: "Inventur Nachweise",
    type: "OBLIGATION",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-29",
    status: "IN_PROGRESS",
    assignee: "Selina Koch",
    deputy: "Jan Fischer",
    scope: "FACILITY",
    criticality: "MEDIUM"
  },
  {
    id: "t-019",
    title: "Verfahrensbeschreibung",
    type: "OBLIGATION",
    obligationLevel: "RECOMMENDED",
    dueDate: "2026-04-11",
    status: "OPEN",
    assignee: "Olga Bauer",
    deputy: "Philipp Egger",
    scope: "SITE",
    criticality: "LOW"
  },
  {
    id: "t-020",
    title: "Vor-Ort Kontrolle",
    type: "DEADLINE",
    obligationLevel: "MANDATORY",
    dueDate: "2026-03-25",
    status: "IN_PROGRESS",
    assignee: "Alexandra Streb",
    deputy: "Moritz Jung",
    scope: "FACILITY",
    criticality: "HIGH"
  }
];

export const taskDetails: Record<string, TaskDetail> = {
  "t-001": {
    attachments: ["Nachweis_2026_01.pdf", "Foto_Anlage.png"],
    history: [
      { date: "2026-02-20", text: "Status erstellt" },
      { date: "2026-02-22", text: "Zustaendigkeit gesetzt" },
      { date: "2026-02-24", text: "Nachweis hinzugefuegt" }
    ]
  },
  "t-002": {
    attachments: ["Quartalsbericht.xlsx"],
    history: [
      { date: "2026-02-18", text: "Aufgabe erstellt" },
      { date: "2026-02-21", text: "Bearbeitung gestartet" }
    ]
  },
  "t-003": {
    attachments: ["Unterweisung_Protokoll.pdf"],
    history: [{ date: "2026-02-19", text: "Task zugewiesen" }]
  }
};
