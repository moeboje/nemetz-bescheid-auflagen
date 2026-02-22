export type LegalDoc = {
  id: string;
  title: string;
  shortDescription: string;
  authorityRef: string;
  authority: string;
  attachments: Array<{ name: string; size: string }>; 
  obligations: Array<{
    id: string;
    title: string;
    level: "MANDATORY" | "RECOMMENDED";
    nextDue: string;
    owner: string;
  }>;
  deadlines: Array<{
    id: string;
    dueDate: string;
    owner: string;
    status: "OPEN" | "IN_PROGRESS" | "DONE";
  }>;
  history: Array<{ id: string; date: string; text: string }>;
};

export const legalDoc: LegalDoc = {
  id: "ld-001",
  title: "Bescheid Abfallanlage Ost",
  shortDescription: "Betrieb der Abfallanlage inkl. Auflagen und Fristen.",
  authorityRef: "AZ 2026/184-NE",
  authority: "Landesregierung",
  attachments: [
    { name: "Bescheid.pdf", size: "2.4 MB" },
    { name: "Anlage A.pdf", size: "1.1 MB" }
  ],
  obligations: [
    {
      id: "ob-01",
      title: "Monatliches Mengenreporting",
      level: "MANDATORY",
      nextDue: "2026-03-15",
      owner: "Mario Prammer"
    },
    {
      id: "ob-02",
      title: "Kontrollbuch fuehren",
      level: "MANDATORY",
      nextDue: "2026-03-05",
      owner: "Lena Hofer"
    },
    {
      id: "ob-03",
      title: "Schulung neuer Mitarbeiter",
      level: "RECOMMENDED",
      nextDue: "2026-04-10",
      owner: "Fatma Yilmaz"
    }
  ],
  deadlines: [
    { id: "dl-01", dueDate: "2026-03-01", owner: "Mario Prammer", status: "OPEN" },
    { id: "dl-02", dueDate: "2026-03-20", owner: "Lena Hofer", status: "IN_PROGRESS" },
    { id: "dl-03", dueDate: "2026-04-02", owner: "Fatma Yilmaz", status: "DONE" }
  ],
  history: [
    { id: "h-01", date: "2026-02-20", text: "Dokument importiert" },
    { id: "h-02", date: "2026-02-22", text: "Auflage hinzugefuegt" },
    { id: "h-03", date: "2026-02-23", text: "Frist aktualisiert" }
  ]
};
