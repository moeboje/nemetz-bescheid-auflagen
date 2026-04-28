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
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  roleTitle?: string;
  notes?: string;
  department?: string;
  isPrimary?: boolean;
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

export const contacts: AuthorityContact[] = [];
