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

export const users: User[] = [];

export function getUserDisplayName(user?: Pick<User, "firstName" | "lastName">) {
  if (!user) {
    return "";
  }
  return `${user.firstName} ${user.lastName}`.trim();
}
