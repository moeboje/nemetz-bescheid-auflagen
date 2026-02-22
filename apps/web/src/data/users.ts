export type UserStub = {
  id: string;
  displayName: string;
  email?: string;
  isExternal: boolean;
  roleLabel?: string;
};

export const users: UserStub[] = [
  {
    id: "u-001",
    displayName: "Mario Prammer",
    email: "m.prammer@nemetz.at",
    isExternal: false,
    roleLabel: "Projektleitung"
  },
  {
    id: "u-002",
    displayName: "Lena Hofer",
    email: "l.hofer@nemetz.at",
    isExternal: false,
    roleLabel: "Umweltmanagement"
  },
  {
    id: "u-003",
    displayName: "Fatma Yilmaz",
    email: "f.yilmaz@nemetz.at",
    isExternal: false,
    roleLabel: "Compliance"
  },
  {
    id: "u-004",
    displayName: "Markus Leitner",
    email: "m.leitner@nemetz.at",
    isExternal: false,
    roleLabel: "Betriebsleitung"
  },
  {
    id: "u-005",
    displayName: "Sabrina Wolf",
    email: "s.wolf@nemetz.at",
    isExternal: false,
    roleLabel: "QS"
  },
  {
    id: "u-006",
    displayName: "Tobias Lang",
    email: "t.lang@nemetz.at",
    isExternal: false,
    roleLabel: "Technik"
  },
  {
    id: "u-007",
    displayName: "Katharina Stein",
    email: "k.stein@nemetz.at",
    isExternal: false,
    roleLabel: "Projektassistenz"
  },
  {
    id: "u-008",
    displayName: "Julia Kern",
    email: "j.kern@nemetz.at",
    isExternal: false,
    roleLabel: "EHS"
  },
  {
    id: "u-009",
    displayName: "Simon Kurz",
    email: "s.kurz@nemetz.at",
    isExternal: false,
    roleLabel: "Instandhaltung"
  },
  {
    id: "u-010",
    displayName: "Andrea Seidl",
    email: "andrea.seidl@partner.at",
    isExternal: true,
    roleLabel: "Beratung"
  },
  {
    id: "u-011",
    displayName: "Rainer Novak",
    email: "rainer.novak@partner.at",
    isExternal: true,
    roleLabel: "Fachgutachten"
  },
  {
    id: "u-012",
    displayName: "Elena Moser",
    email: "elena.moser@partner.at",
    isExternal: true,
    roleLabel: "Auditorin"
  }
];
