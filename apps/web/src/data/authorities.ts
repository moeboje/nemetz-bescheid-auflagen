export type Authority = {
  id: string;
  name: string;
  shortName?: string;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthorityContact = {
  id: string;
  authorityId: string;
  name: string;
  email?: string;
  phone?: string;
  roleTitle?: string;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const authorities: Authority[] = [
  {
    id: "auth-001",
    name: "Bezirkshauptmannschaft",
    shortName: "BH",
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "auth-002",
    name: "Magistrat",
    shortName: "MAG",
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "auth-003",
    name: "Landesregierung (Umwelt)",
    shortName: "LRU",
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  }
];

export const contacts: AuthorityContact[] = [
  {
    id: "contact-001",
    authorityId: "auth-001",
    name: "Sachbearbeitung Umwelt 1",
    roleTitle: "Sachbearbeitung Umwelt",
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "contact-002",
    authorityId: "auth-001",
    name: "Sachbearbeitung Umwelt 2",
    roleTitle: "Team Anlagen",
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "contact-003",
    authorityId: "auth-002",
    name: "Sachbearbeitung Verwaltung 1",
    roleTitle: "Sachbearbeitung Abfall",
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "contact-004",
    authorityId: "auth-002",
    name: "Sachbearbeitung Verwaltung 2",
    roleTitle: "Team Umweltverfahren",
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "contact-005",
    authorityId: "auth-003",
    name: "Sachbearbeitung Umwelt 3",
    roleTitle: "Koordination Bewilligungen",
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  }
];
