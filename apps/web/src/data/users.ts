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
    displayName: "Betriebsleitung 1",
    isExternal: false,
    roleLabel: "Betriebsleitung"
  },
  {
    id: "u-002",
    displayName: "Umweltmanagement 1",
    isExternal: false,
    roleLabel: "Umweltmanagement"
  },
  {
    id: "u-003",
    displayName: "Compliance 1",
    isExternal: false,
    roleLabel: "Compliance"
  },
  {
    id: "u-004",
    displayName: "Betriebsleitung 2",
    isExternal: false,
    roleLabel: "Betriebsleitung"
  },
  {
    id: "u-005",
    displayName: "Umweltmanagement 2",
    isExternal: false,
    roleLabel: "Umweltmanagement"
  },
  {
    id: "u-006",
    displayName: "Instandhaltung 1",
    isExternal: false,
    roleLabel: "Instandhaltung"
  },
  {
    id: "u-007",
    displayName: "Projektkoordination 1",
    isExternal: false,
    roleLabel: "Projektkoordination"
  },
  {
    id: "u-008",
    displayName: "EHS 1",
    isExternal: false,
    roleLabel: "EHS"
  },
  {
    id: "u-009",
    displayName: "Instandhaltung 2",
    isExternal: false,
    roleLabel: "Instandhaltung"
  },
  {
    id: "u-010",
    displayName: "Externe Beratung 1",
    isExternal: true,
    roleLabel: "Beratung"
  },
  {
    id: "u-011",
    displayName: "Fachgutachten 1",
    isExternal: true,
    roleLabel: "Fachgutachten"
  },
  {
    id: "u-012",
    displayName: "Audits 1",
    isExternal: true,
    roleLabel: "Auditorin"
  }
];
