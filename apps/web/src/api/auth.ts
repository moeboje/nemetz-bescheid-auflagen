import { apiRequest } from "./client";
import type { User, UserRole, UserType } from "../data/users";

export type ApiUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  type: UserType;
  isArchived: boolean;
  titleOrPosition?: string | null;
  department?: string | null;
  externalCompany?: string | null;
  externalOrgId?: string | null;
  externalOrgName?: string | null;
  notes?: string | null;
  invitedAt?: string | null;
  lastPasswordResetAt?: string | null;
  mustChangePassword?: boolean;
  passwordUpdatedAt?: string;
  failedLoginCount?: number;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  mfaEnabled?: boolean;
  mfaEnforced?: boolean;
  mfaVerifiedAt?: string | null;
  effectivePermissions?: string[];
  createdAt: string;
  updatedAt: string;
};

type AuthEnvelope = { ok: true; user: ApiUser };
type MfaLoginEnvelope = { ok: true; mfaRequired: true; mfaToken: string };

export type LoginInput = {
  email: string;
  password: string;
};

export type ForgotPasswordInput = {
  email: string;
};

export type ResetPasswordInput = {
  token: string;
  newPassword: string;
};

export type LoginResult =
  | {
      mfaRequired: true;
      mfaToken: string;
    }
  | {
      mfaRequired: false;
      user: User;
    };

export type MfaStatus = {
  enabled: boolean;
  enforced: boolean;
  verifiedAt?: string;
};

export type PasswordPolicy = {
  passwordMinLength: number;
  passwordRequireNumberOrSpecial: boolean;
};

function defaultRoleLabel(role: UserRole) {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "COMPLIANCE_MANAGER":
      return "Compliance Manager";
    case "COMPLIANCE_EDITOR":
      return "Compliance Editor";
    case "READ_ONLY":
      return "Read Only";
    case "COMPLIANCE":
      return "Compliance";
    case "USER":
      return "Benutzer";
    case "EXTERNAL":
      return "Extern";
    default:
      return role;
  }
}

export function mapApiUserToUser(user: ApiUser): User {
  const titleOrPosition = user.titleOrPosition ?? undefined;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    companyRole: titleOrPosition || defaultRoleLabel(user.role),
    email: user.email,
    phone: user.phone ?? undefined,
    role: user.role,
    type: user.type,
    isExternal: user.type === "EXTERNAL",
    isArchived: user.isArchived,
    titleOrPosition,
    department: user.department ?? undefined,
    externalCompany: user.externalCompany ?? undefined,
    externalOrgId: user.externalOrgId ?? undefined,
    externalOrgName: user.externalOrgName ?? undefined,
    notes: user.notes ?? undefined,
    invitedAt: user.invitedAt ?? undefined,
    lastPasswordResetAt: user.lastPasswordResetAt ?? undefined,
    mustChangePassword: user.mustChangePassword ?? false,
    passwordUpdatedAt: user.passwordUpdatedAt,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil ?? undefined,
    lastLoginAt: user.lastLoginAt ?? undefined,
    mfaEnabled: user.mfaEnabled ?? false,
    mfaEnforced: user.mfaEnforced ?? false,
    mfaVerifiedAt: user.mfaVerifiedAt ?? undefined,
    effectivePermissions: Array.isArray(user.effectivePermissions) ? user.effectivePermissions : [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function login(input: LoginInput) {
  const payload = await apiRequest<AuthEnvelope | MfaLoginEnvelope>("/auth/login", {
    method: "POST",
    body: input
  });

  if ("mfaRequired" in payload && payload.mfaRequired) {
    return {
      mfaRequired: true as const,
      mfaToken: payload.mfaToken
    };
  }

  return {
    mfaRequired: false as const,
    user: mapApiUserToUser(payload.user)
  };
}

export async function logout() {
  await apiRequest<{ ok: boolean }>("/auth/logout", {
    method: "POST"
  });
}

export async function me() {
  const payload = await apiRequest<{ user: ApiUser }>("/auth/me", {
    method: "GET"
  });
  return mapApiUserToUser(payload.user);
}

export async function verifyMfa(input: { mfaToken: string; codeOrRecovery: string }) {
  const payload = await apiRequest<{ ok: boolean; user: ApiUser }>("/auth/mfa/verify", {
    method: "POST",
    body: input
  });

  return mapApiUserToUser(payload.user);
}

export async function getMfaStatus() {
  const payload = await apiRequest<MfaStatus>("/auth/mfa/status", {
    method: "GET"
  });

  return payload;
}

export async function getPasswordPolicy() {
  return apiRequest<PasswordPolicy>("/auth/password/policy", {
    method: "GET"
  });
}

export async function setupMfaTotp() {
  return apiRequest<{ ok: boolean; otpauthUrl: string; expiresAt: string; qrDataUrl?: string }>("/auth/mfa/totp/setup", {
    method: "POST"
  });
}

export async function confirmMfaTotp(code: string) {
  return apiRequest<{ ok: boolean; recoveryCodes: string[] }>("/auth/mfa/totp/confirm", {
    method: "POST",
    body: { code }
  });
}

export async function disableMfaTotp(input: { password?: string; code?: string; recoveryCode?: string }) {
  return apiRequest<{ ok: boolean }>("/auth/mfa/totp/disable", {
    method: "POST",
    body: input
  });
}

export async function getEntraStatus() {
  return apiRequest<{ enabled: boolean }>("/auth/entra/status", {
    method: "GET"
  });
}

export async function forgotPassword(input: ForgotPasswordInput) {
  await apiRequest<{ ok: boolean }>("/auth/password/forgot", {
    method: "POST",
    body: input
  });
}

export async function resetPassword(input: ResetPasswordInput) {
  await apiRequest<{ ok: boolean }>("/auth/password/reset", {
    method: "POST",
    body: input
  });
}

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  const payload = await apiRequest<{ ok: boolean; user: ApiUser }>("/auth/password/change", {
    method: "POST",
    body: input
  });

  return mapApiUserToUser(payload.user);
}
