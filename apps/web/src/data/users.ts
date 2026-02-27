export type UserRole = string;
export type UserType = "INTERNAL" | "EXTERNAL";

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  companyRole: string;
  email: string;
  phone?: string;
  role: UserRole;
  type: UserType;
  isExternal: boolean;
  isArchived: boolean;
  titleOrPosition?: string;
  department?: string;
  externalCompany?: string;
  externalOrgId?: string;
  externalOrgName?: string;
  notes?: string;
  invitedAt?: string;
  lastPasswordResetAt?: string;
  mustChangePassword?: boolean;
  passwordUpdatedAt?: string;
  failedLoginCount?: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  mfaEnabled?: boolean;
  mfaEnforced?: boolean;
  mfaVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const users: User[] = [
  {
    id: "u-001",
    firstName: "Max",
    lastName: "Mustermann",
    companyRole: "Betriebsleitung",
    email: "max.demo@example.com",
    phone: "+43 800 100 101",
    role: "ADMIN",
    type: "INTERNAL",
    isExternal: false,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "u-002",
    firstName: "Erika",
    lastName: "Muster",
    companyRole: "Umweltmanagement",
    email: "erika.demo@example.com",
    phone: "+43 800 100 102",
    role: "COMPLIANCE",
    type: "INTERNAL",
    isExternal: false,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "u-003",
    firstName: "Paul",
    lastName: "Beispiel",
    companyRole: "Instandhaltung",
    email: "paul.demo@example.com",
    phone: "+43 800 100 103",
    role: "USER",
    type: "INTERNAL",
    isExternal: false,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "u-004",
    firstName: "Nina",
    lastName: "Demo",
    companyRole: "Qualitaetsmanagement",
    email: "nina.demo@example.com",
    phone: "+43 800 100 104",
    role: "USER",
    type: "INTERNAL",
    isExternal: false,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "u-005",
    firstName: "Tobias",
    lastName: "Test",
    companyRole: "Disposition",
    email: "tobias.demo@example.com",
    phone: "+43 800 100 105",
    role: "USER",
    type: "INTERNAL",
    isExternal: false,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "u-006",
    firstName: "Sabine",
    lastName: "Musterfrau",
    companyRole: "Betriebsbeauftragte",
    email: "sabine.demo@example.com",
    phone: "+43 800 100 106",
    role: "USER",
    type: "INTERNAL",
    isExternal: false,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "u-007",
    firstName: "Alex",
    lastName: "Extern",
    companyRole: "Technisches Buero",
    email: "alex.demo@invalid.local",
    phone: "+43 800 100 201",
    role: "EXTERNAL",
    type: "EXTERNAL",
    isExternal: true,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "u-008",
    firstName: "Chris",
    lastName: "Partner",
    companyRole: "Rechtsanwalt",
    email: "chris.demo@invalid.local",
    phone: "+43 800 100 202",
    role: "EXTERNAL",
    type: "EXTERNAL",
    isExternal: true,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  },
  {
    id: "u-009",
    firstName: "Jamie",
    lastName: "Dienstleister",
    companyRole: "Prueforganisation",
    email: "jamie.demo@invalid.local",
    phone: "+43 800 100 203",
    role: "EXTERNAL",
    type: "EXTERNAL",
    isExternal: true,
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp
  }
];

export function getUserDisplayName(user?: Pick<User, "firstName" | "lastName">) {
  if (!user) {
    return "";
  }
  return `${user.firstName} ${user.lastName}`.trim();
}
