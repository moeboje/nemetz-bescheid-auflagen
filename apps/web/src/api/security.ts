import { apiRequest } from "./client";

export type SecuritySettings = {
  passwordMinLength: number;
  passwordRequireNumberOrSpecial: boolean;
  maxFailedLoginAttempts: number;
  lockoutMinutes: number;
  sessionTtlDays: number;
  allowExternalUsers: boolean;
};

export type SecuritySummary = {
  totalUsers: number;
  activeUsers: number;
  archivedUsers: number;
  adminUsers: number;
  externalUsers: number;
  lockedUsers: number;
  usersMustChangePassword: number;
  mfaEnabledUsers: number;
  adminsWithoutMfa: number;
  entraEnabled: boolean;
};

export type SecurityAuditEvent = {
  id: string;
  action: string;
  actorUserId?: string;
  actorLabel?: string;
  targetUserId?: string;
  targetLabel?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type SecurityOverview = {
  settings: SecuritySettings;
  summary: SecuritySummary;
  warnings: string[];
  auditEvents: SecurityAuditEvent[];
};

export async function getAdminSecurityOverview() {
  return apiRequest<SecurityOverview>("/admin/security", {
    method: "GET"
  });
}

export async function updateAdminSecuritySettings(input: Partial<SecuritySettings>) {
  const payload = await apiRequest<{ ok: boolean; settings: SecuritySettings }>("/admin/security", {
    method: "PATCH",
    body: input
  });

  return payload.settings;
}
