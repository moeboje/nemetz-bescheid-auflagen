import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { type AuditLog, type Prisma, type Session, type User as PrismaUser } from "@prisma/client";
import { Issuer } from "openid-client";
import { loadConfig, type AppConfig } from "./config.js";
import { prisma } from "./prisma.js";
import { createAuthoritiesRouter } from "./routes/authorities.js";
import { createDeadlinesRouter } from "./routes/deadlines.js";
import { createLegalDocsRouter } from "./routes/legalDocs.js";
import { createObligationsRouter } from "./routes/obligations.js";
import { createProjectChecklistsRouter } from "./routes/projectChecklists.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createScopesRouter } from "./routes/scopes.js";
import { createTaskStateRouter } from "./routes/taskState.js";
import {
  createRateLimiter,
  decryptString,
  encryptString,
  generateOpaqueToken,
  hashPassword,
  hashToken,
  parseCookies,
  validateManagedPassword,
  validatePassword,
  verifyPassword
} from "./security.js";
import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  useRecoveryCodeOnce,
  verifyTotpCode
} from "./mfa.js";
import { createEntraStateStore, extractEmailFromClaims, isAllowedEmailDomain } from "./entra.js";
import {
  describePermission,
  getEditablePermissionCatalog,
  getEditableRolePermissionKeys,
  getDefaultPermissionKeys,
  mergeEditableRolePermissionKeys,
  getRoleCatalogEntry,
  hasPermission,
  normalizeRoleKey,
  parsePermissionKeys,
  rolePermissionsRequireAdminAccess,
  resolvePermissionKeys,
  type PermissionKey
} from "./accessControl.js";
import {
  getStoredRolePermissionKeys,
  getStoredRolePermissionMap,
  getStoredRolePermissionState,
  setStoredRolePermissionKeys
} from "./rolePermissions.js";
import {
  getAllowExternalUsers,
  getEffectiveSecuritySettings,
  sanitizeSecuritySettingsInput,
  saveSecuritySettings
} from "./securitySettings.js";
import { createAndDispatchPasswordResetNotification } from "./notifications.js";
import {
  cancelAdminNotification,
  getAdminNotificationDetail,
  getAdminNotificationOverview,
  listAdminNotifications,
  retryAdminNotification
} from "./adminNotifications.js";
import {
  getEffectiveNotificationSettings,
  sanitizeNotificationSettingsInput,
  saveNotificationSettings
} from "./notificationSettings.js";

const SESSION_COOKIE_NAME = "nemetz_session";
const DEFAULT_ADMIN_PAGE = 1;
const DEFAULT_ADMIN_PAGE_SIZE = 20;
const MAX_ADMIN_PAGE_SIZE = 100;
const MFA_PENDING_TTL_MINUTES = 15;
const MFA_CHALLENGE_TTL_MINUTES = 10;
const DEFAULT_POST_LOGIN_PATH = "/compliance/dashboard";
const SAFE_HTTP_METHODS = ["GET", "HEAD", "OPTIONS"] as const;

const USER_TYPES = ["INTERNAL", "EXTERNAL"] as const;
const ADMIN_SORT_FIELDS = ["name", "email", "createdAt", "lastLoginAt"] as const;
const SORT_DIRECTIONS = ["asc", "desc"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const DOCUMENT_OWNER_TYPES = ["PROJECT", "LEGAL_DOC", "OBLIGATION", "DEADLINE", "TASK_EVIDENCE"] as const;
const COMMENT_ENTITY_TYPES = ["PROJECT", "LEGAL_DOC", "DOCUMENT"] as const;
const MAX_COMMENT_ENTITY_ID_LENGTH = 200;
const MAX_COMMENT_BODY_LENGTH = 10_000;

type UserRole = string;
type UserType = (typeof USER_TYPES)[number];
type AdminSortField = (typeof ADMIN_SORT_FIELDS)[number];
type SortDirection = (typeof SORT_DIRECTIONS)[number];
type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];
type CommentEntityType = (typeof COMMENT_ENTITY_TYPES)[number];

type AuthenticatedRequest = Request & {
  authUser?: PrismaUser;
  authSession?: Session;
  authPermissionKeys?: PermissionKey[];
};

type SafeUserDto = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  type: UserType;
  isArchived: boolean;
  titleOrPosition?: string;
  department?: string;
  externalCompany?: string;
  externalOrgId?: string;
  externalOrgName?: string;
  notes?: string;
  invitedAt?: string;
  lastPasswordResetAt?: string;
  mustChangePassword: boolean;
  passwordUpdatedAt: string;
  failedLoginCount: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  mfaEnabled: boolean;
  mfaEnforced: boolean;
  mfaVerifiedAt?: string;
  effectivePermissions: PermissionKey[];
  createdAt: string;
  updatedAt: string;
};

type AdminUserListItemDto = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  type: UserType;
  isArchived: boolean;
  titleOrPosition?: string;
  externalCompany?: string;
  externalOrgId?: string;
  externalOrgName?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  lastPasswordResetAt?: string;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil?: string;
  mfaEnabled: boolean;
  mfaEnforced: boolean;
  mfaVerifiedAt?: string;
};

type LoginSuccessPayload =
  | {
      ok: true;
      mfaRequired: true;
      mfaToken: string;
    }
  | {
      ok: true;
      user: SafeUserDto;
    };

type UserWithExternalOrg = PrismaUser & {
  externalOrg?: {
    id: string;
    name: string;
  } | null;
};

type AdminRoleDto = {
  id: string;
  key: string;
  labelDe: string;
  descriptionDe?: string;
  isSystem: boolean;
  isAssignable: boolean;
  isDeprecated: boolean;
  permissionKeys: PermissionKey[];
  permissionLabels: string[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type AdminRoleLookupDto = {
  id: string;
  key: string;
  labelDe: string;
  descriptionDe?: string;
  isSystem: boolean;
  isAssignable: boolean;
  isDeprecated: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type SecuritySettingsDto = {
  passwordMinLength: number;
  passwordRequireNumberOrSpecial: boolean;
  maxFailedLoginAttempts: number;
  lockoutMinutes: number;
  sessionTtlDays: number;
  allowExternalUsers: boolean;
};

type PasswordPolicyDto = Pick<SecuritySettingsDto, "passwordMinLength" | "passwordRequireNumberOrSpecial">;

type SecurityAuditEventDto = {
  id: string;
  action: string;
  actorUserId?: string;
  actorLabel?: string;
  targetUserId?: string;
  targetLabel?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

type SecuritySummaryDto = {
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

type NotificationSettingsDto = {
  defaultDueSoonDays: number;
  deadlineDueSoonEnabled: boolean;
  assignmentAssignedEnabled: boolean;
  dailyDigestEnabled: boolean;
  weeklyDigestEnabled: boolean;
  dailyDigestHourLocal: number;
  weeklyDigestWeekday: number;
};

type ExternalOrganizationDto = {
  id: string;
  name: string;
  type: string;
  phone?: string;
  email?: string;
  address?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type MultipartFormDataResult = {
  fields: Record<string, string>;
  file?: {
    filename?: string;
    contentType?: string;
    data: Buffer;
  };
};

type DocumentDto = {
  id: string;
  ownerType: string;
  ownerId: string;
  filename: string;
  originalFilename?: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type CommentAuthorDto = {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  type: UserType;
};

type CommentDto = {
  id: string;
  entityType: CommentEntityType;
  entityId: string;
  author: CommentAuthorDto;
  body: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  editedAt?: string;
  editedByUserId?: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedByUserId?: string;
};

type CommentRevisionDto = {
  revisionNo: number;
  body: string;
  createdAt: string;
  createdByUserId: string;
};

function normalizeRoleValue(value: string): UserRole {
  const normalized = normalizeRoleKeyInput(value);
  if (normalized) {
    return normalized;
  }

  const trimmed = value.trim();
  return trimmed || "USER";
}

function normalizeTypeValue(value: string): UserType {
  return USER_TYPES.includes(value as UserType) ? (value as UserType) : "INTERNAL";
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : undefined;
}

function extractExternalOrg(user: PrismaUser | UserWithExternalOrg) {
  if ("externalOrg" in user && user.externalOrg) {
    return {
      externalOrgId: user.externalOrg.id,
      externalOrgName: user.externalOrg.name
    };
  }

  return {
    externalOrgId: user.externalOrgId ?? undefined,
    externalOrgName: user.externalCompany ?? undefined
  };
}

function resolveRolePermissionKeys(
  roleKey: string,
  userType: string,
  roleRow?: {
    roleExists?: boolean;
    hasStoredPermissions?: boolean;
    permissionKeys?: unknown;
  } | null
) {
  const isCatalogRole = Boolean(getRoleCatalogEntry(roleKey));
  return resolvePermissionKeys({
    roleKey,
    userType,
    storedPermissionKeys: roleRow?.permissionKeys,
    hasStoredPermissionKeys: roleRow?.hasStoredPermissions,
    useLegacyInternalFallback: Boolean(roleRow?.roleExists && !roleRow?.hasStoredPermissions && !isCatalogRole)
  });
}

function toSafeUser(user: PrismaUser | UserWithExternalOrg, permissionKeys: PermissionKey[] = getDefaultPermissionKeys(user.role, user.type)): SafeUserDto {
  const externalOrg = extractExternalOrg(user);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? undefined,
    role: normalizeRoleValue(user.role),
    type: normalizeTypeValue(user.type),
    isArchived: user.isArchived,
    titleOrPosition: user.titleOrPosition ?? undefined,
    department: user.department ?? undefined,
    externalCompany: user.externalCompany ?? undefined,
    externalOrgId: externalOrg.externalOrgId,
    externalOrgName: externalOrg.externalOrgName,
    notes: user.notes ?? undefined,
    invitedAt: toIsoString(user.invitedAt),
    lastPasswordResetAt: toIsoString(user.lastPasswordResetAt),
    mustChangePassword: user.mustChangePassword,
    passwordUpdatedAt: user.passwordUpdatedAt.toISOString(),
    failedLoginCount: user.failedLoginCount,
    lockedUntil: toIsoString(user.lockedUntil),
    lastLoginAt: toIsoString(user.lastLoginAt),
    mfaEnabled: user.mfaEnabled,
    mfaEnforced: user.mfaEnforced,
    mfaVerifiedAt: toIsoString(user.mfaVerifiedAt),
    effectivePermissions: permissionKeys,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

function toAdminRole(role: {
  id: string;
  key: string;
  labelDe: string;
  descriptionDe: string | null;
  permissionsJson?: Prisma.JsonValue | null;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminRoleDto {
  const catalogEntry = getRoleCatalogEntry(role.key);
  const permissionKeys = resolvePermissionKeys({
    roleKey: role.key,
    userType: "INTERNAL",
    storedPermissionKeys: role.permissionsJson
  });
  const editablePermissionKeys = getEditableRolePermissionKeys(permissionKeys);

  return {
    id: role.id,
    key: role.key,
    labelDe: role.labelDe,
    descriptionDe: role.descriptionDe ?? undefined,
    isSystem: role.isSystem,
    isAssignable: catalogEntry?.isAssignable ?? !catalogEntry?.isDeprecated,
    isDeprecated: Boolean(catalogEntry?.isDeprecated),
    permissionKeys: editablePermissionKeys,
    permissionLabels: editablePermissionKeys.map((permissionKey) => describePermission(permissionKey)),
    isArchived: role.isArchived,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString()
  };
}

function toAdminRoleLookup(role: {
  id: string;
  key: string;
  labelDe: string;
  descriptionDe: string | null;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminRoleLookupDto {
  const catalogEntry = getRoleCatalogEntry(role.key);

  return {
    id: role.id,
    key: role.key,
    labelDe: role.labelDe,
    descriptionDe: role.descriptionDe ?? undefined,
    isSystem: role.isSystem,
    isAssignable: catalogEntry?.isAssignable ?? !catalogEntry?.isDeprecated,
    isDeprecated: Boolean(catalogEntry?.isDeprecated),
    isArchived: role.isArchived,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString()
  };
}

function toSecuritySettingsDto(value: SecuritySettingsDto) {
  return {
    passwordMinLength: value.passwordMinLength,
    passwordRequireNumberOrSpecial: value.passwordRequireNumberOrSpecial,
    maxFailedLoginAttempts: value.maxFailedLoginAttempts,
    lockoutMinutes: value.lockoutMinutes,
    sessionTtlDays: value.sessionTtlDays,
    allowExternalUsers: value.allowExternalUsers
  } satisfies SecuritySettingsDto;
}

function toPasswordPolicyDto(value: SecuritySettingsDto): PasswordPolicyDto {
  return {
    passwordMinLength: value.passwordMinLength,
    passwordRequireNumberOrSpecial: value.passwordRequireNumberOrSpecial
  };
}

function toNotificationSettingsDto(value: NotificationSettingsDto) {
  return {
    defaultDueSoonDays: value.defaultDueSoonDays,
    deadlineDueSoonEnabled: value.deadlineDueSoonEnabled,
    assignmentAssignedEnabled: value.assignmentAssignedEnabled,
    dailyDigestEnabled: value.dailyDigestEnabled,
    weeklyDigestEnabled: value.weeklyDigestEnabled,
    dailyDigestHourLocal: value.dailyDigestHourLocal,
    weeklyDigestWeekday: value.weeklyDigestWeekday
  } satisfies NotificationSettingsDto;
}

function toSecurityAuditEvent(entry: {
  id: string;
  action: string;
  createdAt: Date;
  metadataJson: string | null;
  actorUserId: string | null;
  targetUserId: string | null;
  actor?: { firstName: string; lastName: string } | null;
  target?: { firstName: string; lastName: string } | null;
}): SecurityAuditEventDto {
  let metadata: Record<string, unknown> | undefined;
  if (typeof entry.metadataJson === "string" && entry.metadataJson.trim()) {
    try {
      const parsed = JSON.parse(entry.metadataJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      metadata = undefined;
    }
  }

  return {
    id: entry.id,
    action: entry.action,
    actorUserId: entry.actorUserId ?? undefined,
    actorLabel: entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}`.trim() : undefined,
    targetUserId: entry.targetUserId ?? undefined,
    targetLabel: entry.target ? `${entry.target.firstName} ${entry.target.lastName}`.trim() : undefined,
    createdAt: entry.createdAt.toISOString(),
    metadata
  };
}

function toExternalOrganization(row: {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ExternalOrganizationDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    isArchived: row.isArchived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toAdminUserListItem(user: PrismaUser | UserWithExternalOrg): AdminUserListItemDto {
  const externalOrg = extractExternalOrg(user);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? undefined,
    role: normalizeRoleValue(user.role),
    type: normalizeTypeValue(user.type),
    isArchived: user.isArchived,
    titleOrPosition: user.titleOrPosition ?? undefined,
    externalCompany: user.externalCompany ?? undefined,
    externalOrgId: externalOrg.externalOrgId,
    externalOrgName: externalOrg.externalOrgName,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: toIsoString(user.lastLoginAt),
    lastPasswordResetAt: toIsoString(user.lastPasswordResetAt),
    mustChangePassword: user.mustChangePassword,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: toIsoString(user.lockedUntil),
    mfaEnabled: user.mfaEnabled,
    mfaEnforced: user.mfaEnforced,
    mfaVerifiedAt: toIsoString(user.mfaVerifiedAt)
  };
}

function normalizeEmail(input: string) {
  return input.trim().toLowerCase();
}

function toOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function ensureStringBody(value: unknown) {
  return typeof value === "string" ? value : "";
}

function hasOwn(input: unknown, key: string) {
  return Boolean(input && typeof input === "object" && Object.prototype.hasOwnProperty.call(input, key));
}

function normalizeRoleKeyInput(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (!normalized || !ROLE_KEY_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeRequestedRole(value: string) {
  if (value === "USER") {
    return "COMPLIANCE_EDITOR";
  }

  if (value === "COMPLIANCE") {
    return "COMPLIANCE_MANAGER";
  }

  return value;
}

function parseRole(value: unknown): UserRole | null {
  const normalized = normalizeRoleKeyInput(value);
  return normalized ? normalizeRequestedRole(normalized) : null;
}

function parseType(value: unknown): UserType | null {
  if (typeof value !== "string") {
    return null;
  }
  return USER_TYPES.includes(value as UserType) ? (value as UserType) : null;
}

async function findAssignableRole(roleKey: string) {
  const catalogEntry = getRoleCatalogEntry(roleKey);
  const role = await prisma.role.findUnique({
    where: {
      key: roleKey
    }
  });

  if (role) {
    if (role.isArchived) {
      return null;
    }
    if (catalogEntry && !catalogEntry.isAssignable) {
      return null;
    }
    return role;
  }

  if (catalogEntry?.isAssignable) {
    return {
      id: `fallback:${roleKey}`,
      key: roleKey,
      labelDe: roleKey,
      descriptionDe: null,
      isSystem: true,
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    };
  }

  return null;
}

async function findActiveExternalOrganization(externalOrgId: string) {
  return prisma.externalOrganization.findFirst({
    where: {
      id: externalOrgId,
      isArchived: false
    }
  });
}

function parseAdminSortField(value: unknown): AdminSortField {
  if (typeof value !== "string") {
    return "name";
  }
  return ADMIN_SORT_FIELDS.includes(value as AdminSortField) ? (value as AdminSortField) : "name";
}

function parseSortDirection(value: unknown): SortDirection {
  if (typeof value !== "string") {
    return "asc";
  }
  return SORT_DIRECTIONS.includes(value as SortDirection) ? (value as SortDirection) : "asc";
}

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const raw = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  if (max && parsed > max) {
    return max;
  }
  return parsed;
}

function parseArchivedFilter(value: unknown): "true" | "false" | "all" {
  if (value === "all") {
    return "all";
  }

  if (value === true || value === "true") {
    return "true";
  }

  if (value === false || value === "false") {
    return "false";
  }

  return "false";
}

function isTrue(value: unknown) {
  return value === "true" || value === true;
}

function parseBoolean(value: unknown) {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return null;
}

function parsePasswordMode(value: unknown): "link" | "manual" | "auto" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "link" || normalized === "manual" || normalized === "auto") {
    return normalized;
  }
  return null;
}

function parseAdminResetPasswordMode(value: unknown): "link" | "manual" | "auto" | "direct" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "direct") {
    return normalized;
  }

  return parsePasswordMode(normalized);
}

function generateTemporaryPassword() {
  return `${generateOpaqueToken(12)}Aa1!`;
}

function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(value);
}

function normalizeRedirectPath(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_POST_LOGIN_PATH;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return trimmed;
}

function getRequestMeta(req: Request) {
  const userAgent = toOptionalTrimmedString(req.get("user-agent"));
  return {
    ip: req.ip || undefined,
    userAgent
  };
}

function asMetadataJson(metadata?: Record<string, unknown>) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return undefined;
  }

  try {
    return JSON.stringify(metadata);
  } catch {
    return undefined;
  }
}

function isDocumentOwnerType(value: string): value is DocumentOwnerType {
  return DOCUMENT_OWNER_TYPES.includes(value as DocumentOwnerType);
}

function isCommentEntityType(value: string): value is CommentEntityType {
  return COMMENT_ENTITY_TYPES.includes(value as CommentEntityType);
}

function parseCommentEntityType(value: unknown): CommentEntityType | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !isCommentEntityType(trimmed)) {
    return null;
  }

  return trimmed;
}

function parseCommentEntityId(value: unknown): string | null {
  const entityId = toOptionalTrimmedString(value);
  if (!entityId) {
    return null;
  }
  if (entityId.length > MAX_COMMENT_ENTITY_ID_LENGTH) {
    return null;
  }
  return entityId;
}

function parseCommentBody(value: unknown): string | null {
  const body = ensureStringBody(value).trim();
  if (!body) {
    return null;
  }
  if (body.length > MAX_COMMENT_BODY_LENGTH) {
    return null;
  }
  return body;
}

function toDocumentDto(document: {
  id: string;
  ownerType: string;
  ownerId: string;
  filename: string;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): DocumentDto {
  return {
    id: document.id,
    ownerType: document.ownerType,
    ownerId: document.ownerId,
    filename: document.filename,
    originalFilename: document.originalFilename ?? undefined,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    createdAt: document.createdAt.toISOString()
  };
}

function toCommentAuthorDto(input: {
  authorUserId: string;
  author?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    type: string;
  } | null;
}): CommentAuthorDto {
  if (!input.author) {
    return {
      id: input.authorUserId,
      firstName: "",
      lastName: "",
      role: "USER",
      type: "INTERNAL"
    };
  }

  return {
    id: input.author.id,
    firstName: input.author.firstName,
    lastName: input.author.lastName,
    role: normalizeRoleValue(input.author.role),
    type: normalizeTypeValue(input.author.type)
  };
}

function toCommentDto(
  comment: {
    id: string;
    entityType: string;
    entityId: string;
    authorUserId: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    isEdited: boolean;
    editedAt: Date | null;
    editedByUserId: string | null;
    deletedAt: Date | null;
    deletedByUserId: string | null;
  },
  author?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    type: string;
  } | null
): CommentDto {
  return {
    id: comment.id,
    entityType: isCommentEntityType(comment.entityType) ? comment.entityType : "PROJECT",
    entityId: comment.entityId,
    author: toCommentAuthorDto({
      authorUserId: comment.authorUserId,
      author
    }),
    body: comment.deletedAt ? "" : comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    isEdited: comment.isEdited,
    editedAt: toIsoString(comment.editedAt),
    editedByUserId: comment.editedByUserId ?? undefined,
    isDeleted: Boolean(comment.deletedAt),
    deletedAt: toIsoString(comment.deletedAt),
    deletedByUserId: comment.deletedByUserId ?? undefined
  };
}

function toCommentRevisionDto(revision: {
  revisionNo: number;
  body: string;
  createdAt: Date;
  createdByUserId: string;
}): CommentRevisionDto {
  return {
    revisionNo: revision.revisionNo,
    body: revision.body,
    createdAt: revision.createdAt.toISOString(),
    createdByUserId: revision.createdByUserId
  };
}

function canManageComment(user: PrismaUser, comment: { authorUserId: string }) {
  return (
    comment.authorUserId === user.id ||
    (normalizeRoleValue(user.role) === "ADMIN" && normalizeTypeValue(user.type) === "INTERNAL")
  );
}

function resolveStorageRoot(config: AppConfig) {
  if (path.isAbsolute(config.documentsStorageDir)) {
    return path.resolve(config.documentsStorageDir);
  }
  return path.resolve(process.cwd(), config.documentsStorageDir);
}

function resolveUploadDir(config: AppConfig) {
  return path.resolve(resolveStorageRoot(config), "uploads");
}

function resolveStoredDocumentPath(config: AppConfig, storagePath: string) {
  const storageRoot = resolveStorageRoot(config);
  const uploadRoot = resolveUploadDir(config);
  const absolutePath = path.resolve(storageRoot, storagePath);
  const normalizedUploadRoot = `${uploadRoot}${path.sep}`;
  if (!absolutePath.startsWith(normalizedUploadRoot)) {
    return null;
  }
  return absolutePath;
}

function sanitizeFilename(filename: string | undefined) {
  const basename = path.basename((filename ?? "").replace(/\0/g, "").trim());
  const safe = basename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim();
  return safe || "document";
}

function inferMimeType(filename: string, candidateMimeType?: string) {
  const normalizedCandidate = candidateMimeType?.trim().toLowerCase();
  if (normalizedCandidate && normalizedCandidate !== "application/octet-stream") {
    return normalizedCandidate;
  }

  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".svg":
      return "image/svg+xml";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

function isPreviewableMimeType(mimeType: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

function toContentDispositionFilename(filename: string) {
  const escaped = filename.replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `filename="${escaped}"; filename*=UTF-8''${encoded}`;
}

function parseBoundary(contentType: string | undefined) {
  if (!contentType) {
    return null;
  }
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) {
    return null;
  }
  const boundary = (match[1] ?? match[2] ?? "").trim();
  return boundary || null;
}

function parseMultipartFormData(contentType: string | undefined, body: Buffer): MultipartFormDataResult | null {
  const boundary = parseBoundary(contentType);
  if (!boundary) {
    return null;
  }

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const headersDelimiter = Buffer.from("\r\n\r\n");
  const nextBoundaryPrefix = Buffer.from(`\r\n--${boundary}`);
  const fields: Record<string, string> = {};
  let file: MultipartFormDataResult["file"] | undefined;

  let cursor = body.indexOf(boundaryBuffer);
  if (cursor < 0) {
    return null;
  }

  while (cursor >= 0) {
    cursor += boundaryBuffer.length;

    if (body.subarray(cursor, cursor + 2).toString("utf8") === "--") {
      break;
    }

    if (body.subarray(cursor, cursor + 2).toString("utf8") === "\r\n") {
      cursor += 2;
    }

    const headersEnd = body.indexOf(headersDelimiter, cursor);
    if (headersEnd < 0) {
      return null;
    }

    const headersText = body.subarray(cursor, headersEnd).toString("utf8");
    const headers = headersText.split("\r\n").reduce<Record<string, string>>((acc, headerLine) => {
      const separator = headerLine.indexOf(":");
      if (separator > 0) {
        const key = headerLine.slice(0, separator).trim().toLowerCase();
        const value = headerLine.slice(separator + 1).trim();
        if (key) {
          acc[key] = value;
        }
      }
      return acc;
    }, {});

    const dataStart = headersEnd + headersDelimiter.length;
    const nextBoundaryIndex = body.indexOf(nextBoundaryPrefix, dataStart);
    if (nextBoundaryIndex < 0) {
      return null;
    }

    const partData = body.subarray(dataStart, nextBoundaryIndex);
    const disposition = headers["content-disposition"] ?? "";
    const nameMatch = disposition.match(/name="([^"]+)"/i);
    const fieldName = nameMatch?.[1]?.trim();
    if (fieldName) {
      const filenameMatch = disposition.match(/filename="([^"]*)"/i);
      if (filenameMatch && file === undefined) {
        file = {
          filename: filenameMatch[1],
          contentType: headers["content-type"],
          data: Buffer.from(partData)
        };
      } else {
        fields[fieldName] = partData.toString("utf8").trim();
      }
    }

    cursor = nextBoundaryIndex + 2;
  }

  return {
    fields,
    file
  };
}

async function audit(input: {
  actorUserId?: string;
  targetUserId?: string;
  action: string;
  req: Request;
  metadata?: Record<string, unknown>;
}): Promise<AuditLog> {
  const meta = getRequestMeta(input.req);
  return prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      action: input.action,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadataJson: asMetadataJson(input.metadata)
    }
  });
}

function getRoleAndType(input: {
  role?: UserRole | null;
  type?: UserType | null;
  fallbackRole: UserRole;
  fallbackType: UserType;
}) {
  return {
    role: input.role ?? input.fallbackRole,
    type: input.type ?? input.fallbackType
  };
}

async function discoverEntraClient(config: AppConfig) {
  const issuer = await Issuer.discover(
    `https://login.microsoftonline.com/${encodeURIComponent(config.entraTenantId)}/v2.0/.well-known/openid-configuration`
  );

  return new issuer.Client({
    client_id: config.entraClientId,
    client_secret: config.entraClientSecret,
    redirect_uris: [config.entraRedirectUri],
    response_types: ["code"]
  });
}

function isEntraConfigured(config: AppConfig) {
  return Boolean(
    config.authEnableEntra &&
      config.entraTenantId &&
      config.entraClientId &&
      config.entraClientSecret &&
      config.entraRedirectUri
  );
}

function toSearchable(row: Pick<PrismaUser, "firstName" | "lastName" | "email">) {
  return `${row.firstName} ${row.lastName} ${row.email}`.toLowerCase();
}

function compareNullableDates(left: Date | null, right: Date | null) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.getTime() - right.getTime();
}

function compareAdminUsers(left: PrismaUser, right: PrismaUser, sort: AdminSortField) {
  switch (sort) {
    case "email":
      return left.email.localeCompare(right.email);
    case "createdAt":
      return left.createdAt.getTime() - right.createdAt.getTime();
    case "lastLoginAt":
      return compareNullableDates(left.lastLoginAt, right.lastLoginAt);
    default:
      return `${left.firstName} ${left.lastName}`.localeCompare(`${right.firstName} ${right.lastName}`);
  }
}

async function hasOtherActiveAdmin(excludedUserId: string) {
  const count = await prisma.user.count({
    where: {
      id: {
        not: excludedUserId
      },
      isArchived: false,
      role: "ADMIN",
      type: "INTERNAL"
    }
  });

  return count > 0;
}

async function getStoredRole(roleKey: string) {
  return getStoredRolePermissionState(prisma, normalizeRoleValue(roleKey));
}

async function getUserPermissionKeys(user: Pick<PrismaUser, "role" | "type">) {
  const role = await getStoredRole(user.role);
  return resolveRolePermissionKeys(normalizeRoleValue(user.role), normalizeTypeValue(user.type), role);
}

function assertAuthenticated(req: AuthenticatedRequest, res: Response): req is AuthenticatedRequest & {
  authUser: PrismaUser;
  authSession: Session;
} {
  if (!req.authUser || !req.authSession) {
    res.status(401).json({
      ok: false,
      message: "Authentication required."
    });
    return false;
  }
  return true;
}

function authorizeAdmin(req: AuthenticatedRequest, res: Response): req is AuthenticatedRequest & {
  authUser: PrismaUser;
  authSession: Session;
} {
  if (!assertAuthenticated(req, res)) {
    return false;
  }

  if (!hasPermission(req.authPermissionKeys ?? [], "admin.access")) {
    res.status(403).json({
      ok: false,
      message: "Admin access required."
    });
    return false;
  }

  return true;
}

async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const rawSessionToken = cookies.get(SESSION_COOKIE_NAME);

    if (!rawSessionToken) {
      res.status(401).json({ ok: false, message: "Authentication required." });
      return;
    }

    const tokenHash = hashToken(rawSessionToken);
    const now = new Date();

    const session = await prisma.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now
        }
      },
      include: {
        user: true
      }
    });

    if (!session || session.user.isArchived) {
      res.status(401).json({ ok: false, message: "Authentication required." });
      return;
    }

    if (await shouldBlockExternalUser(session.user.type)) {
      await prisma.session.update({
        where: {
          id: session.id
        },
        data: {
          revokedAt: now
        }
      });
      res.status(401).json({ ok: false, message: "Authentication required." });
      return;
    }

    req.authUser = session.user;
    req.authSession = session;
    req.authPermissionKeys = await getUserPermissionKeys(session.user);
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!authorizeAdmin(req, res)) {
    return;
  }

  next();
}

function authorizeAdminPermissions(
  req: AuthenticatedRequest,
  res: Response,
  permissionKeys: PermissionKey[]
): req is AuthenticatedRequest & {
  authUser: PrismaUser;
  authSession: Session;
} {
  if (!authorizeAdmin(req, res)) {
    return false;
  }

  if (permissionKeys.some((permissionKey) => hasPermission(req.authPermissionKeys ?? [], permissionKey))) {
    return true;
  }

  res.status(403).json({
    ok: false,
    message: `Missing admin permission. Required one of: ${permissionKeys.join(", ")}`
  });
  return false;
}

function requireAdminPermissions(...permissionKeys: PermissionKey[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!authorizeAdminPermissions(req, res, permissionKeys)) {
      return;
    }

    next();
  };
}

function getRolePermissionValidationMessage(permissionKeys: PermissionKey[]) {
  if (rolePermissionsRequireAdminAccess(permissionKeys) && !permissionKeys.includes("admin.access")) {
    return "admin.access is required for admin sub-section permissions.";
  }

  return null;
}

function canAccessDocuments(permissionKeys: Iterable<string>) {
  return (
    hasPermission(permissionKeys, "projects.view") ||
    hasPermission(permissionKeys, "legalDocs.view") ||
    hasPermission(permissionKeys, "obligations.view") ||
    hasPermission(permissionKeys, "deadlines.view") ||
    hasPermission(permissionKeys, "tasks.view")
  );
}

function canManageDocuments(permissionKeys: Iterable<string>) {
  return (
    hasPermission(permissionKeys, "projects.edit") ||
    hasPermission(permissionKeys, "legalDocs.edit") ||
    hasPermission(permissionKeys, "obligations.edit") ||
    hasPermission(permissionKeys, "deadlines.edit") ||
    hasPermission(permissionKeys, "tasks.edit")
  );
}

function assertCanAccessDocuments(req: AuthenticatedRequest, res: Response): req is AuthenticatedRequest & {
  authUser: PrismaUser;
  authSession: Session;
} {
  if (!assertAuthenticated(req, res)) {
    return false;
  }

  if (normalizeTypeValue(req.authUser.type) === "EXTERNAL") {
    res.status(403).json({
      ok: false,
      message: "Forbidden."
    });
    return false;
  }

  const permissionKeys = req.authPermissionKeys ?? [];

  if (!canAccessDocuments(permissionKeys)) {
    res.status(403).json({
      ok: false,
      message: "Forbidden."
    });
    return false;
  }

  if (!SAFE_HTTP_METHODS.includes(req.method as (typeof SAFE_HTTP_METHODS)[number]) && !canManageDocuments(permissionKeys)) {
    res.status(403).json({
      ok: false,
      message: "Forbidden."
    });
    return false;
  }

  return true;
}

function applySecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
}

function createCorsMiddleware(config: AppConfig) {
  return cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(origin === config.appOrigin ? null : new Error("Origin not allowed"), origin === config.appOrigin);
    },
    credentials: true
  });
}

function isSafeHttpMethod(method: string) {
  return SAFE_HTTP_METHODS.includes(method.toUpperCase() as (typeof SAFE_HTTP_METHODS)[number]);
}

function isCrossSiteRequest(req: Request) {
  const fetchSite = toOptionalTrimmedString(req.get("sec-fetch-site"))?.toLowerCase();
  return fetchSite === "cross-site";
}

function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isSafeHttpMethod(req.method)) {
    next();
    return;
  }

  if (isCrossSiteRequest(req)) {
    res.status(403).json({
      ok: false,
      message: "Cross-site requests are not allowed."
    });
    return;
  }

  next();
}

function setSessionCookie(res: Response, token: string, config: AppConfig, sessionTtlDays = config.sessionTtlDays) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
    maxAge: sessionTtlDays * 24 * 60 * 60 * 1000
  });
}

function clearSessionCookie(res: Response, config: AppConfig) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/"
  });
}

function isExternalUserType(userType: string | null | undefined) {
  return normalizeTypeValue(String(userType ?? "")) === "EXTERNAL";
}

async function shouldBlockExternalUser(userType: string | null | undefined) {
  if (!isExternalUserType(userType)) {
    return false;
  }

  return !(await getAllowExternalUsers(prisma));
}

function buildMfaChallengeIpHash(req: Request) {
  const ip = req.ip?.trim();
  return ip ? hashToken(ip) : null;
}

function buildMfaChallengeUaHash(req: Request) {
  const userAgent = toOptionalTrimmedString(req.get("user-agent"));
  return userAgent ? hashToken(userAgent) : null;
}

async function verifyMfaCodeOrRecovery(args: {
  user: PrismaUser;
  codeOrRecovery: string;
  sessionSecret: string;
}): Promise<{ valid: boolean; usedRecovery: boolean; nextRecoveryHashJson?: string }> {
  const rawInput = args.codeOrRecovery.trim();
  if (!rawInput) {
    return { valid: false, usedRecovery: false };
  }

  if (args.user.mfaTotpSecretEnc) {
    try {
      const secret = decryptString(args.user.mfaTotpSecretEnc, args.sessionSecret);
      if (verifyTotpCode(secret, rawInput)) {
        return { valid: true, usedRecovery: false };
      }
    } catch {
      // Secret decode failed, continue with recovery check.
    }
  }

  const recoveryUse = useRecoveryCodeOnce(rawInput, args.user.mfaRecoveryCodesHashJson);
  if (recoveryUse.matched) {
    return {
      valid: true,
      usedRecovery: true,
      nextRecoveryHashJson: recoveryUse.nextHashJson
    };
  }

  return { valid: false, usedRecovery: false };
}

export function createApp(config: AppConfig = loadConfig()) {
  const app = express();

  app.set("trust proxy", 1);
  app.use(applySecurityHeaders);
  app.use(createCorsMiddleware(config));
  app.use(express.json({ limit: "1mb" }));
  app.use(csrfProtectionMiddleware);

  const router = express.Router();
  router.use(createAuthoritiesRouter(prisma));
  router.use(createDeadlinesRouter(prisma));
  router.use(createLegalDocsRouter(prisma));
  router.use(createObligationsRouter(prisma));
  router.use(createProjectChecklistsRouter(prisma));
  router.use(createProjectsRouter(prisma));
  router.use(createScopesRouter(prisma));
  router.use(createTaskStateRouter(prisma));
  const entraStateStore = createEntraStateStore();
  const entraEnabled = isEntraConfigured(config);
  let entraClientPromise: ReturnType<typeof discoverEntraClient> | null = null;

  const getEntraClient = async () => {
    if (!entraEnabled) {
      throw new Error("Entra authentication is disabled.");
    }
    if (!entraClientPromise) {
      entraClientPromise = discoverEntraClient(config);
    }
    return entraClientPromise;
  };

  const loginLimiter = createRateLimiter({
    keyPrefix: "login",
    maxRequests: 10,
    windowMs: 5 * 60 * 1000
  });

  const forgotLimiter = createRateLimiter({
    keyPrefix: "forgot",
    maxRequests: 5,
    windowMs: 10 * 60 * 1000
  });

  const passwordResetLimiter = createRateLimiter({
    keyPrefix: "password-reset",
    maxRequests: 10,
    windowMs: 10 * 60 * 1000
  });

  const mfaVerifyLimiter = createRateLimiter({
    keyPrefix: "mfa-verify",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000
  });

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/auth/entra/status", (_req, res) => {
    res.json({
      enabled: entraEnabled
    });
  });

  router.get("/auth/entra/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!entraEnabled) {
        res.status(404).json({ ok: false, message: "Entra authentication is disabled." });
        return;
      }

      const returnTo = normalizeRedirectPath(req.query.returnTo);
      const { state, nonce } = entraStateStore.issueState({ returnTo });
      const client = await getEntraClient();

      const authorizationUrl = client.authorizationUrl({
        scope: config.entraScopes.join(" "),
        response_mode: "query",
        state,
        nonce
      });

      res.redirect(authorizationUrl);
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/entra/callback", async (req: Request, res: Response) => {
    const appOrigin = config.appOrigin.endsWith("/") ? config.appOrigin.slice(0, -1) : config.appOrigin;
    const redirectWithError = (code: string) => {
      const target = `${appOrigin}/login?oidcError=${encodeURIComponent(code)}`;
      res.redirect(target);
    };

    try {
      if (!entraEnabled) {
        redirectWithError("entra_disabled");
        return;
      }

      const stateParam = typeof req.query.state === "string" ? req.query.state : "";
      const stateData = entraStateStore.consumeState(stateParam);
      if (!stateData) {
        redirectWithError("invalid_state");
        return;
      }

      const client = await getEntraClient();
      const params = client.callbackParams(req);
      const tokenSet = await client.callback(config.entraRedirectUri, params, {
        state: stateParam,
        nonce: stateData.nonce
      });
      const claims = tokenSet.claims() as Record<string, unknown>;
      const email = extractEmailFromClaims(claims);

      if (!email || !isAllowedEmailDomain(email, config.entraAllowedDomains)) {
        redirectWithError("email_not_allowed");
        return;
      }

      let user = await prisma.user.findUnique({
        where: {
          email
        }
      });

      if (!user && config.entraAutoProvision) {
        const firstName = typeof claims.given_name === "string" && claims.given_name.trim() ? claims.given_name.trim() : "Entra";
        const lastName =
          typeof claims.family_name === "string" && claims.family_name.trim() ? claims.family_name.trim() : "User";
        const randomPassword = generateOpaqueToken(24);
        const passwordHash = await hashPassword(randomPassword);

        user = await prisma.user.create({
          data: {
            firstName,
            lastName,
            email,
            role: "USER",
            type: "INTERNAL",
            passwordHash,
            passwordUpdatedAt: new Date()
          }
        });

        await audit({
          actorUserId: user.id,
          targetUserId: user.id,
          action: "USER_CREATED",
          req,
          metadata: {
            source: "entra_auto_provision"
          }
        });
      }

      if (!user || user.isArchived) {
        redirectWithError("user_not_found");
        return;
      }

      if (await shouldBlockExternalUser(user.type)) {
        redirectWithError("external_users_disabled");
        return;
      }

      const securitySettings = await getEffectiveSecuritySettings(prisma, config);
      const now = new Date();
      const rawToken = generateOpaqueToken(32);
      const sessionHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + securitySettings.sessionTtlDays * 24 * 60 * 60 * 1000);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: now
          }
        }),
        prisma.session.create({
          data: {
            userId: user.id,
            tokenHash: sessionHash,
            expiresAt,
            ip: req.ip,
            userAgent: toOptionalTrimmedString(req.get("user-agent"))
          }
        })
      ]);

      setSessionCookie(res, rawToken, config, securitySettings.sessionTtlDays);

      await audit({
        actorUserId: user.id,
        targetUserId: user.id,
        action: "LOGIN_SUCCESS",
        req,
        metadata: {
          provider: "entra"
        }
      });

      res.redirect(`${appOrigin}${stateData.returnTo || DEFAULT_POST_LOGIN_PATH}`);
    } catch (error) {
      redirectWithError("callback_failed");
      if (config.nodeEnv === "development" && error instanceof Error) {
        process.stderr.write(`${error.message}\n`);
      }
    }
  });

  router.post("/auth/login", loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const securitySettings = await getEffectiveSecuritySettings(prisma, config);
      const rawEmail = ensureStringBody(req.body?.email);
      const rawPassword = ensureStringBody(req.body?.password);

      if (!rawEmail.trim() || !rawPassword) {
        res.status(400).json({ ok: false, message: "Email and password are required." });
        return;
      }

      const email = normalizeEmail(rawEmail);
      const user = await prisma.user.findUnique({
        where: {
          email
        }
      });

      const now = new Date();

      if (user?.lockedUntil && user.lockedUntil > now) {
        await audit({
          actorUserId: user.id,
          targetUserId: user.id,
          action: "LOGIN_FAIL",
          req,
          metadata: { reason: "LOCKED" }
        });
        res.status(429).json({ ok: false, message: "Account is temporarily locked." });
        return;
      }

      if (user && normalizeTypeValue(user.type) === "EXTERNAL" && !securitySettings.allowExternalUsers) {
        await audit({
          actorUserId: user.id,
          targetUserId: user.id,
          action: "LOGIN_FAIL",
          req,
          metadata: { reason: "EXTERNAL_ACCESS_DISABLED" }
        });
        res.status(403).json({ ok: false, message: "External users are currently disabled." });
        return;
      }

      let isPasswordValid = false;
      if (user && !user.isArchived) {
        isPasswordValid = await verifyPassword(user.passwordHash, rawPassword);
      }

      if (!isPasswordValid || !user) {
        if (user) {
          const nextFailedCount = user.failedLoginCount + 1;
          const shouldLock = nextFailedCount >= securitySettings.maxFailedLoginAttempts;
          const nextLockedUntil = shouldLock
            ? new Date(Date.now() + securitySettings.lockoutMinutes * 60 * 1000)
            : user.lockedUntil;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: nextFailedCount,
              lockedUntil: nextLockedUntil
            }
          });

          if (shouldLock && (!user.lockedUntil || user.lockedUntil <= now)) {
            await audit({
              actorUserId: user.id,
              targetUserId: user.id,
              action: "USER_LOCKED",
              req,
              metadata: {
                failedLoginCount: nextFailedCount,
                lockedUntil: nextLockedUntil?.toISOString()
              }
            });
          }
        }

        await audit({
          actorUserId: user?.id,
          targetUserId: user?.id,
          action: "LOGIN_FAIL",
          req,
          metadata: {
            email
          }
        });

        res.status(401).json({ ok: false, message: "Invalid credentials." });
        return;
      }

      const requiresMfa = user.mfaEnabled || user.mfaEnforced;

      if (requiresMfa) {
        const rawMfaToken = generateOpaqueToken(32);
        const mfaTokenHash = hashToken(rawMfaToken);
        const challengeExpiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MINUTES * 60 * 1000);

        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: 0,
              lockedUntil: null
            }
          }),
          prisma.mfaChallenge.deleteMany({
            where: {
              userId: user.id
            }
          }),
          prisma.mfaChallenge.create({
            data: {
              userId: user.id,
              tokenHash: mfaTokenHash,
              expiresAt: challengeExpiresAt,
              ipHash: buildMfaChallengeIpHash(req),
              uaHash: buildMfaChallengeUaHash(req)
            }
          })
        ]);

        await audit({
          actorUserId: user.id,
          targetUserId: user.id,
          action: "LOGIN_MFA_REQUIRED",
          req,
          metadata: {
            enforced: user.mfaEnforced,
            enabled: user.mfaEnabled
          }
        });

        const response: LoginSuccessPayload = {
          ok: true,
          mfaRequired: true,
          mfaToken: rawMfaToken
        };
        res.json(response);
        return;
      }

      const rawToken = generateOpaqueToken(32);
      const sessionHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + securitySettings.sessionTtlDays * 24 * 60 * 60 * 1000);
      const permissionKeys = await getUserPermissionKeys(user);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: now
          }
        }),
        prisma.session.create({
          data: {
            userId: user.id,
            tokenHash: sessionHash,
            expiresAt,
            ip: req.ip,
            userAgent: toOptionalTrimmedString(req.get("user-agent"))
          }
        })
      ]);

      setSessionCookie(res, rawToken, config, securitySettings.sessionTtlDays);

      await audit({
        actorUserId: user.id,
        targetUserId: user.id,
        action: "LOGIN_SUCCESS",
        req
      });

      const response: LoginSuccessPayload = {
        ok: true,
        user: toSafeUser(
          {
            ...user,
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: now,
            updatedAt: now
          },
          permissionKeys
        )
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/logout", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const rawToken = cookies.get(SESSION_COOKIE_NAME);

      if (rawToken) {
        const tokenHash = hashToken(rawToken);
        const session = await prisma.session.findUnique({
          where: {
            tokenHash
          }
        });

        if (session && !session.revokedAt) {
          await prisma.session.update({
            where: {
              id: session.id
            },
            data: {
              revokedAt: new Date()
            }
          });

          await audit({
            actorUserId: session.userId,
            targetUserId: session.userId,
            action: "LOGOUT",
            req
          });
        }
      }

      clearSessionCookie(res, config);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!assertAuthenticated(req, res)) {
      return;
    }

    res.json({
      user: toSafeUser(req.authUser, req.authPermissionKeys ?? [])
    });
  });

  router.get("/auth/password/policy", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const securitySettings = await getEffectiveSecuritySettings(prisma, config);
      res.json(toPasswordPolicyDto(securitySettings));
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/documents",
    authMiddleware,
    express.raw({ type: "multipart/form-data", limit: config.documentsMaxUploadBytes }),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        if (!assertCanAccessDocuments(req, res)) {
          return;
        }

        if (!Buffer.isBuffer(req.body)) {
          res.status(400).json({ ok: false, message: "Multipart payload is required." });
          return;
        }

        const parsed = parseMultipartFormData(req.headers["content-type"], req.body);
        if (!parsed || !parsed.file) {
          res.status(400).json({ ok: false, message: "ownerType, ownerId and file are required." });
          return;
        }

        const ownerTypeRaw = parsed.fields.ownerType?.trim().toUpperCase() ?? "";
        const ownerId = parsed.fields.ownerId?.trim() ?? "";
        if (!isDocumentOwnerType(ownerTypeRaw) || !ownerId) {
          res.status(400).json({ ok: false, message: "ownerType and ownerId are required." });
          return;
        }

        const fileData = parsed.file.data;
        if (!fileData.length) {
          res.status(400).json({ ok: false, message: "file is required." });
          return;
        }

        if (fileData.length > config.documentsMaxUploadBytes) {
          res.status(413).json({ ok: false, message: "File exceeds upload size limit." });
          return;
        }

        const originalFilename = parsed.file.filename?.trim() || undefined;
        const safeFilename = sanitizeFilename(originalFilename);
        const mimeType = inferMimeType(safeFilename, parsed.file.contentType);
        const sha256 = createHash("sha256").update(fileData).digest("hex");

        const created = await prisma.document.create({
          data: {
            ownerType: ownerTypeRaw,
            ownerId,
            filename: safeFilename,
            originalFilename: originalFilename ?? null,
            mimeType,
            sizeBytes: fileData.length,
            storagePath: "uploads/pending",
            sha256,
            createdByUserId: req.authUser.id
          }
        });

        const storagePath = path.posix.join("uploads", created.id);
        const absoluteFilePath = resolveStoredDocumentPath(config, storagePath);
        if (!absoluteFilePath) {
          await prisma.document.delete({
            where: {
              id: created.id
            }
          });
          res.status(400).json({ ok: false, message: "Invalid storage path." });
          return;
        }

        try {
          await fs.mkdir(path.dirname(absoluteFilePath), { recursive: true });
          await fs.writeFile(absoluteFilePath, fileData);
        } catch (error) {
          await prisma.document.delete({
            where: {
              id: created.id
            }
          });
          throw error;
        }

        const updated = await prisma.document.update({
          where: {
            id: created.id
          },
          data: {
            storagePath
          }
        });

        await audit({
          actorUserId: req.authUser.id,
          action: "DOCUMENT_UPLOADED",
          req,
          metadata: {
            documentId: updated.id,
            ownerType: updated.ownerType,
            ownerId: updated.ownerId,
            mimeType: updated.mimeType,
            sizeBytes: updated.sizeBytes
          }
        });

        res.status(201).json({
          ok: true,
          document: toDocumentDto(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get("/documents", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertCanAccessDocuments(req, res)) {
        return;
      }

      const ownerTypeRaw = toOptionalTrimmedString(req.query.ownerType)?.toUpperCase() ?? "";
      const ownerId = toOptionalTrimmedString(req.query.ownerId) ?? "";
      if (!isDocumentOwnerType(ownerTypeRaw) || !ownerId) {
        res.status(400).json({ ok: false, message: "ownerType and ownerId are required." });
        return;
      }

      const documents = await prisma.document.findMany({
        where: {
          ownerType: ownerTypeRaw,
          ownerId,
          isArchived: false
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      res.json({
        items: documents.map((document) => toDocumentDto(document))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/documents/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertCanAccessDocuments(req, res)) {
        return;
      }

      const documentId = req.params.id;
      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          isArchived: false
        }
      });

      if (!document) {
        res.status(404).json({ ok: false, message: "Document not found." });
        return;
      }

      res.json({
        document: toDocumentDto(document)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/documents/:id/file", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertCanAccessDocuments(req, res)) {
        return;
      }

      const documentId = req.params.id;
      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          isArchived: false
        }
      });

      if (!document) {
        res.status(404).json({ ok: false, message: "Document not found." });
        return;
      }

      const absoluteFilePath = resolveStoredDocumentPath(config, document.storagePath);
      if (!absoluteFilePath) {
        res.status(400).json({ ok: false, message: "Invalid document storage path." });
        return;
      }

      let content: Buffer;
      try {
        content = await fs.readFile(absoluteFilePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          res.status(404).json({ ok: false, message: "Document content missing." });
          return;
        }
        throw error;
      }

      const requestedDownload = isTrue(req.query.download);
      const dispositionType = requestedDownload
        ? "attachment"
        : isPreviewableMimeType(document.mimeType)
        ? "inline"
        : "attachment";
      const downloadFilename = document.originalFilename || document.filename;

      res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", String(content.length));
      res.setHeader(
        "Content-Disposition",
        `${dispositionType}; ${toContentDispositionFilename(downloadFilename)}`
      );
      res.setHeader("Cache-Control", "private, no-store");

      await audit({
        actorUserId: req.authUser.id,
        action: "DOCUMENT_DOWNLOADED",
        req,
        metadata: {
          documentId: document.id,
          ownerType: document.ownerType,
          ownerId: document.ownerId,
          dispositionType
        }
      });

      res.status(200).send(content);
    } catch (error) {
      next(error);
    }
  });

  router.get("/comments", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const entityType = parseCommentEntityType(req.query.entityType);
      const entityId = parseCommentEntityId(req.query.entityId);

      if (!entityType || !entityId) {
        res.status(400).json({ ok: false, message: "entityType and entityId are required." });
        return;
      }

      const comments = await prisma.comment.findMany({
        where: {
          entityType,
          entityId
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      const authorIds = [...new Set(comments.map((comment) => comment.authorUserId))];
      const authors = authorIds.length
        ? await prisma.user.findMany({
            where: {
              id: {
                in: authorIds
              }
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              type: true
            }
          })
        : [];
      const authorById = new Map(authors.map((author) => [author.id, author] as const));

      res.json({
        items: comments.map((comment) => toCommentDto(comment, authorById.get(comment.authorUserId)))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/comments", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const entityType = parseCommentEntityType(req.body?.entityType);
      const entityId = parseCommentEntityId(req.body?.entityId);
      const body = parseCommentBody(req.body?.body);

      if (!entityType || !entityId || !body) {
        res.status(400).json({
          ok: false,
          message: "Invalid comment input."
        });
        return;
      }

      const createdComment = await prisma.$transaction(async (tx) => {
        const created = await tx.comment.create({
          data: {
            entityType,
            entityId,
            authorUserId: req.authUser.id,
            body
          }
        });

        await tx.commentRevision.create({
          data: {
            commentId: created.id,
            revisionNo: 1,
            body,
            createdByUserId: req.authUser.id
          }
        });

        return created;
      });

      await audit({
        actorUserId: req.authUser.id,
        action: "COMMENT_CREATED",
        req,
        metadata: {
          entityType,
          entityId,
          commentId: createdComment.id
        }
      });

      res.status(201).json({
        ok: true,
        comment: toCommentDto(createdComment, req.authUser)
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/comments/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const commentId = toOptionalTrimmedString(req.params.id);
      const body = parseCommentBody(req.body?.body);
      if (!commentId || !body) {
        res.status(400).json({
          ok: false,
          message: "Invalid comment input."
        });
        return;
      }

      const currentComment = await prisma.comment.findUnique({
        where: {
          id: commentId
        }
      });

      if (!currentComment) {
        res.status(404).json({ ok: false, message: "Comment not found." });
        return;
      }

      if (currentComment.deletedAt) {
        res.status(400).json({ ok: false, message: "Deleted comments cannot be edited." });
        return;
      }

      if (!canManageComment(req.authUser, currentComment)) {
        res.status(403).json({ ok: false, message: "Not allowed to edit comment." });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const latestRevision = await tx.commentRevision.findFirst({
          where: {
            commentId
          },
          select: {
            revisionNo: true
          },
          orderBy: {
            revisionNo: "desc"
          }
        });

        const nextRevisionNo = (latestRevision?.revisionNo ?? 0) + 1;
        const updated = await tx.comment.update({
          where: {
            id: commentId
          },
          data: {
            body,
            isEdited: true,
            editedAt: new Date(),
            editedByUserId: req.authUser.id
          }
        });

        await tx.commentRevision.create({
          data: {
            commentId,
            revisionNo: nextRevisionNo,
            body,
            createdByUserId: req.authUser.id
          }
        });

        return {
          updated,
          revisionNo: nextRevisionNo
        };
      });

      await audit({
        actorUserId: req.authUser.id,
        action: "COMMENT_EDITED",
        req,
        metadata: {
          entityType: result.updated.entityType,
          entityId: result.updated.entityId,
          commentId: result.updated.id,
          revisionNo: result.revisionNo
        }
      });

      const author =
        result.updated.authorUserId === req.authUser.id
          ? req.authUser
          : await prisma.user.findUnique({
              where: {
                id: result.updated.authorUserId
              },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                type: true
              }
            });

      res.json({
        ok: true,
        revisionNo: result.revisionNo,
        comment: toCommentDto(result.updated, author)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/comments/:id/revisions", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const commentId = toOptionalTrimmedString(req.params.id);
      if (!commentId) {
        res.status(400).json({ ok: false, message: "Comment id is required." });
        return;
      }

      const comment = await prisma.comment.findUnique({
        where: {
          id: commentId
        },
        select: {
          id: true,
          authorUserId: true
        }
      });

      if (!comment) {
        res.status(404).json({ ok: false, message: "Comment not found." });
        return;
      }

      if (!canManageComment(req.authUser, comment)) {
        res.status(403).json({ ok: false, message: "Not allowed to view revisions." });
        return;
      }

      const revisions = await prisma.commentRevision.findMany({
        where: {
          commentId
        },
        orderBy: {
          revisionNo: "asc"
        }
      });

      res.json({
        items: revisions.map((revision) => toCommentRevisionDto(revision))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/comments/:id/delete", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const commentId = toOptionalTrimmedString(req.params.id);
      if (!commentId) {
        res.status(400).json({ ok: false, message: "Comment id is required." });
        return;
      }

      const comment = await prisma.comment.findUnique({
        where: {
          id: commentId
        }
      });

      if (!comment) {
        res.status(404).json({ ok: false, message: "Comment not found." });
        return;
      }

      if (!canManageComment(req.authUser, comment)) {
        res.status(403).json({ ok: false, message: "Not allowed to delete comment." });
        return;
      }

      if (!comment.deletedAt) {
        await prisma.comment.update({
          where: {
            id: commentId
          },
          data: {
            deletedAt: new Date(),
            deletedByUserId: req.authUser.id
          }
        });

        await audit({
          actorUserId: req.authUser.id,
          action: "COMMENT_DELETED",
          req,
          metadata: {
            entityType: comment.entityType,
            entityId: comment.entityId,
            commentId: comment.id
          }
        });
      }

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/mfa/status", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    if (!assertAuthenticated(req, res)) {
      return;
    }

    res.json({
      enabled: req.authUser.mfaEnabled,
      enforced: req.authUser.mfaEnforced,
      verifiedAt: toIsoString(req.authUser.mfaVerifiedAt)
    });
  });

  router.post("/auth/mfa/totp/setup", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const secret = generateTotpSecret();
      const secretEnc = encryptString(secret, config.sessionSecret);
      const expiresAt = new Date(Date.now() + MFA_PENDING_TTL_MINUTES * 60 * 1000);

      await prisma.$transaction([
        prisma.mfaPending.deleteMany({
          where: {
            userId: req.authUser.id
          }
        }),
        prisma.mfaPending.create({
          data: {
            userId: req.authUser.id,
            secretEnc,
            expiresAt
          }
        })
      ]);

      await audit({
        actorUserId: req.authUser.id,
        targetUserId: req.authUser.id,
        action: "MFA_SETUP_START",
        req,
        metadata: {
          expiresAt: expiresAt.toISOString()
        }
      });

      res.json({
        ok: true,
        otpauthUrl: buildOtpAuthUrl(req.authUser.email, secret),
        expiresAt: expiresAt.toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/mfa/totp/confirm", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const code = ensureStringBody(req.body?.code).trim();
      if (!code) {
        res.status(400).json({ ok: false, message: "Code is required." });
        return;
      }

      const pending = await prisma.mfaPending.findFirst({
        where: {
          userId: req.authUser.id,
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      if (!pending) {
        res.status(400).json({ ok: false, message: "MFA setup has expired. Please restart setup." });
        return;
      }

      const secret = decryptString(pending.secretEnc, config.sessionSecret);
      if (!verifyTotpCode(secret, code)) {
        res.status(400).json({ ok: false, message: "Invalid TOTP code." });
        return;
      }

      const recoveryCodes = generateRecoveryCodes(10);
      const recoveryHashes = recoveryCodes.map((entry) => hashRecoveryCode(entry));
      const recoveryHashJson = JSON.stringify(recoveryHashes);
      const now = new Date();

      await prisma.$transaction([
        prisma.user.update({
          where: { id: req.authUser.id },
          data: {
            mfaEnabled: true,
            mfaTotpSecretEnc: pending.secretEnc,
            mfaVerifiedAt: now,
            mfaRecoveryCodesHashJson: recoveryHashJson
          }
        }),
        prisma.mfaPending.deleteMany({
          where: {
            userId: req.authUser.id
          }
        })
      ]);

      await audit({
        actorUserId: req.authUser.id,
        targetUserId: req.authUser.id,
        action: "MFA_ENABLED",
        req,
        metadata: {
          recoveryCodeCount: recoveryCodes.length
        }
      });

      res.json({
        ok: true,
        recoveryCodes
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/mfa/totp/disable", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const currentUser = await prisma.user.findUnique({
        where: {
          id: req.authUser.id
        }
      });

      if (!currentUser) {
        res.status(404).json({ ok: false, message: "User not found." });
        return;
      }

      if (currentUser.mfaEnforced) {
        res.status(400).json({ ok: false, message: "MFA is enforced and cannot be disabled." });
        return;
      }

      const password = ensureStringBody(req.body?.password).trim();
      const code = ensureStringBody(req.body?.code).trim();
      const recoveryCode = ensureStringBody(req.body?.recoveryCode).trim();

      if (!password && !code && !recoveryCode) {
        res.status(400).json({ ok: false, message: "Re-authentication is required." });
        return;
      }

      let reauthValid = false;
      let usedRecovery = false;

      if (password) {
        reauthValid = await verifyPassword(currentUser.passwordHash, password);
      }

      if (!reauthValid && code && currentUser.mfaTotpSecretEnc) {
        try {
          const secret = decryptString(currentUser.mfaTotpSecretEnc, config.sessionSecret);
          reauthValid = verifyTotpCode(secret, code);
        } catch {
          reauthValid = false;
        }
      }

      if (!reauthValid && recoveryCode) {
        const recoveryUse = useRecoveryCodeOnce(recoveryCode, currentUser.mfaRecoveryCodesHashJson);
        if (recoveryUse.matched) {
          reauthValid = true;
          usedRecovery = true;
        }
      }

      if (!reauthValid) {
        res.status(401).json({ ok: false, message: "Invalid credentials." });
        return;
      }

      await prisma.$transaction([
        prisma.user.update({
          where: {
            id: currentUser.id
          },
          data: {
            mfaEnabled: false,
            mfaTotpSecretEnc: null,
            mfaVerifiedAt: null,
            mfaRecoveryCodesHashJson: null
          }
        }),
        prisma.mfaPending.deleteMany({
          where: {
            userId: currentUser.id
          }
        }),
        prisma.mfaChallenge.deleteMany({
          where: {
            userId: currentUser.id
          }
        })
      ]);

      await audit({
        actorUserId: currentUser.id,
        targetUserId: currentUser.id,
        action: "MFA_DISABLED",
        req,
        metadata: {
          usedRecovery
        }
      });

      if (usedRecovery) {
        await audit({
          actorUserId: currentUser.id,
          targetUserId: currentUser.id,
          action: "MFA_RECOVERY_USED",
          req
        });
      }

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/mfa/verify", mfaVerifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const securitySettings = await getEffectiveSecuritySettings(prisma, config);
      const mfaToken = ensureStringBody(req.body?.mfaToken).trim();
      const codeOrRecovery = ensureStringBody(req.body?.codeOrRecovery).trim();

      if (!mfaToken || !codeOrRecovery) {
        res.status(400).json({ ok: false, message: "mfaToken and codeOrRecovery are required." });
        return;
      }

      const challenge = await prisma.mfaChallenge.findFirst({
        where: {
          tokenHash: hashToken(mfaToken),
          expiresAt: {
            gt: new Date()
          }
        },
        include: {
          user: true
        }
      });

      if (!challenge || challenge.user.isArchived) {
        res.status(401).json({ ok: false, message: "Invalid MFA challenge." });
        return;
      }

      if (await shouldBlockExternalUser(challenge.user.type)) {
        await prisma.mfaChallenge.delete({
          where: {
            id: challenge.id
          }
        });
        res.status(403).json({ ok: false, message: "External users are currently disabled." });
        return;
      }

      const ipHash = buildMfaChallengeIpHash(req);
      const uaHash = buildMfaChallengeUaHash(req);
      if ((challenge.ipHash && ipHash !== challenge.ipHash) || (challenge.uaHash && uaHash !== challenge.uaHash)) {
        await prisma.mfaChallenge.delete({ where: { id: challenge.id } });
        await audit({
          actorUserId: challenge.userId,
          targetUserId: challenge.userId,
          action: "MFA_VERIFY_FAIL",
          req,
          metadata: {
            reason: "client_mismatch"
          }
        });
        res.status(401).json({ ok: false, message: "Invalid MFA challenge." });
        return;
      }

      const verification = await verifyMfaCodeOrRecovery({
        user: challenge.user,
        codeOrRecovery,
        sessionSecret: config.sessionSecret
      });

      if (!verification.valid) {
        await audit({
          actorUserId: challenge.userId,
          targetUserId: challenge.userId,
          action: "MFA_VERIFY_FAIL",
          req
        });
        res.status(401).json({ ok: false, message: "Invalid MFA code." });
        return;
      }

      const now = new Date();
      const rawSessionToken = generateOpaqueToken(32);
      const sessionHash = hashToken(rawSessionToken);
      const expiresAt = new Date(Date.now() + securitySettings.sessionTtlDays * 24 * 60 * 60 * 1000);
      const userUpdateData: Prisma.UserUpdateInput = {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        mfaVerifiedAt: now
      };

      if (verification.usedRecovery && verification.nextRecoveryHashJson !== undefined) {
        userUpdateData.mfaRecoveryCodesHashJson = verification.nextRecoveryHashJson;
      }

      const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
          where: {
            id: challenge.userId
          },
          data: userUpdateData
        }),
        prisma.session.create({
          data: {
            userId: challenge.userId,
            tokenHash: sessionHash,
            expiresAt,
            ip: req.ip,
            userAgent: toOptionalTrimmedString(req.get("user-agent"))
          }
        }),
        prisma.mfaChallenge.delete({
          where: {
            id: challenge.id
          }
        })
      ]);

      setSessionCookie(res, rawSessionToken, config, securitySettings.sessionTtlDays);

      await audit({
        actorUserId: challenge.userId,
        targetUserId: challenge.userId,
        action: "MFA_VERIFY_SUCCESS",
        req,
        metadata: {
          usedRecovery: verification.usedRecovery
        }
      });

      if (verification.usedRecovery) {
        await audit({
          actorUserId: challenge.userId,
          targetUserId: challenge.userId,
          action: "MFA_RECOVERY_USED",
          req
        });
      }

      await audit({
        actorUserId: challenge.userId,
        targetUserId: challenge.userId,
        action: "LOGIN_SUCCESS",
        req,
        metadata: {
          provider: "password+mfa"
        }
      });

      const permissionKeys = await getUserPermissionKeys(updatedUser);

      res.json({
        ok: true,
        user: toSafeUser(updatedUser, permissionKeys)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/password/forgot", forgotLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = normalizeEmail(ensureStringBody(req.body?.email));

      if (email) {
        const user = await prisma.user.findUnique({
          where: {
            email
          }
        });

        if (user && !user.isArchived) {
          let resetMetadata: Record<string, unknown> = {};

          try {
            const reset = await createAndDispatchPasswordResetNotification(prisma, config, {
              user,
              ttlMinutes: config.resetTokenTtlMinutes
            });

            resetMetadata = {
              expiresAt: reset.expiresAt.toISOString(),
              notificationId: reset.notificationId,
              deliveryStatus: reset.deliveryStatus
            };
          } catch (notificationError) {
            resetMetadata = {
              deliveryStatus: "FAILED",
              deliveryError: notificationError instanceof Error ? notificationError.message : "Password reset dispatch failed."
            };
          }

          await audit({
            actorUserId: user.id,
            targetUserId: user.id,
            action: "RESET_REQUEST",
            req,
            metadata: resetMetadata
          });
        }
      }

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/password/reset", passwordResetLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const securitySettings = await getEffectiveSecuritySettings(prisma, config);
      const token = ensureStringBody(req.body?.token).trim();
      const newPassword = ensureStringBody(req.body?.newPassword);

      if (!token || !newPassword) {
        res.status(400).json({ ok: false, message: "Token and password are required." });
        return;
      }

      const passwordValidation = validatePassword(newPassword, {
        minLength: securitySettings.passwordMinLength,
        requireNumberOrSpecial: securitySettings.passwordRequireNumberOrSpecial
      });
      if (!passwordValidation.valid) {
        res.status(400).json({ ok: false, message: passwordValidation.message });
        return;
      }

      const tokenHashValue = hashToken(token);
      const now = new Date();
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          tokenHash: tokenHashValue,
          usedAt: null,
          expiresAt: {
            gt: now
          }
        },
        include: {
          user: true
        }
      });

      if (!resetToken || resetToken.user.isArchived) {
        res.status(400).json({ ok: false, message: "Invalid or expired reset token." });
        return;
      }

      const passwordHash = await hashPassword(newPassword);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetToken.userId },
          data: {
            passwordHash,
            passwordUpdatedAt: now,
            lastPasswordResetAt: now,
            mustChangePassword: false,
            failedLoginCount: 0,
            lockedUntil: null
          }
        }),
        prisma.passwordResetToken.updateMany({
          where: {
            userId: resetToken.userId,
            usedAt: null
          },
          data: {
            usedAt: now
          }
        }),
        prisma.session.updateMany({
          where: {
            userId: resetToken.userId,
            revokedAt: null
          },
          data: {
            revokedAt: now
          }
        })
      ]);

      await audit({
        actorUserId: resetToken.userId,
        targetUserId: resetToken.userId,
        action: "RESET_CONFIRM",
        req
      });

      clearSessionCookie(res, config);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/password/change", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const securitySettings = await getEffectiveSecuritySettings(prisma, config);
      const currentPassword = ensureStringBody(req.body?.currentPassword);
      const newPassword = ensureStringBody(req.body?.newPassword);

      if (!currentPassword || !newPassword) {
        res.status(400).json({ ok: false, message: "currentPassword and newPassword are required." });
        return;
      }

      const isCurrentPasswordValid = await verifyPassword(req.authUser.passwordHash, currentPassword);
      if (!isCurrentPasswordValid) {
        res.status(400).json({ ok: false, message: "Current password is invalid." });
        return;
      }

      const passwordValidation = validatePassword(newPassword, {
        minLength: securitySettings.passwordMinLength,
        requireNumberOrSpecial: securitySettings.passwordRequireNumberOrSpecial
      });
      if (!passwordValidation.valid) {
        res.status(400).json({ ok: false, message: passwordValidation.message });
        return;
      }

      const now = new Date();
      const passwordHash = await hashPassword(newPassword);
      const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
          where: { id: req.authUser.id },
          data: {
            passwordHash,
            passwordUpdatedAt: now,
            lastPasswordResetAt: now,
            mustChangePassword: false,
            failedLoginCount: 0,
            lockedUntil: null
          }
        }),
        prisma.session.updateMany({
          where: {
            userId: req.authUser.id,
            revokedAt: null,
            id: {
              not: req.authSession.id
            }
          },
          data: {
            revokedAt: now
          }
        })
      ]);

      await audit({
        actorUserId: req.authUser.id,
        targetUserId: req.authUser.id,
        action: "PASSWORD_CHANGED",
        req
      });

      const permissionKeys = await getUserPermissionKeys(updatedUser);
      res.json({
        ok: true,
        user: toSafeUser(updatedUser, permissionKeys)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/users",
    authMiddleware,
    requireAdminPermissions("users.view", "users.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const includeArchived = isTrue(req.query.includeArchived);
      const search = toOptionalTrimmedString(req.query.search ?? req.query.q);
      const role = parseRole(req.query.role);
      const type = parseType(req.query.type);

      const users = await prisma.user.findMany({
        where: {
          isArchived: includeArchived ? undefined : false
        },
        include: {
          externalOrg: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      const normalizedSearch = search?.toLowerCase();
      const filtered = users
        .filter((row) => (role ? row.role === role : true))
        .filter((row) => (type ? row.type === type : true))
        .filter((row) => (normalizedSearch ? toSearchable(row).includes(normalizedSearch) : true))
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

      res.json({
        users: filtered.map((row) => toSafeUser(row))
      });
    } catch (error) {
      next(error);
    }
    }
  );

  router.get("/users/lookup", authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!assertAuthenticated(req, res)) {
        return;
      }

      const includeArchived = isTrue(req.query.includeArchived);
      const search = toOptionalTrimmedString(req.query.q ?? req.query.search);
      const role = parseRole(req.query.role);
      const type = parseType(req.query.type);
      const normalizedSearch = search?.toLowerCase();

      const users = await prisma.user.findMany({
        where: {
          isArchived: includeArchived ? undefined : false
        },
        include: {
          externalOrg: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      const items = users
        .filter((row) => (role ? row.role === role : true))
        .filter((row) => (type ? row.type === type : true))
        .filter((row) => (normalizedSearch ? toSearchable(row).includes(normalizedSearch) : true))
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
        .map((row) => ({
          id: row.id,
          displayName: `${row.firstName} ${row.lastName}`.trim(),
          firstName: row.firstName,
          lastName: row.lastName,
          isArchived: row.isArchived,
          role: normalizeRoleValue(row.role),
          type: normalizeTypeValue(row.type),
          externalOrgId: row.externalOrg?.id ?? row.externalOrgId ?? undefined,
          externalOrgName: row.externalOrg?.name ?? undefined,
          externalCompany: row.externalCompany ?? undefined
        }));

      res.json({
        items
      });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/admin/roles/catalog",
    authMiddleware,
    requireAdminPermissions("roles.view", "roles.manage"),
    async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        res.json({
          permissions: getEditablePermissionCatalog()
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/roles/lookup",
    authMiddleware,
    requireAdminPermissions("roles.view", "roles.manage", "users.view", "users.manage"),
    async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const roles = await prisma.role.findMany({
          orderBy: [
            {
              isSystem: "desc"
            },
            {
              key: "asc"
            }
          ]
        });

        res.json({
          items: roles.map((row) => toAdminRoleLookup(row)),
          total: roles.length
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/roles",
    authMiddleware,
    requireAdminPermissions("roles.view", "roles.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const search = toOptionalTrimmedString(req.query.q ?? req.query.search)?.toLowerCase();
        const archived = parseArchivedFilter(req.query.archived);

        const roles = await prisma.role.findMany({
          where: {
            isArchived: archived === "all" ? undefined : archived === "true"
          },
          orderBy: [
            {
              isSystem: "desc"
            },
            {
              key: "asc"
            }
          ]
        });

        const filtered = search
          ? roles.filter((row) =>
              `${row.key} ${row.labelDe} ${row.descriptionDe ?? ""}`.toLowerCase().includes(search)
            )
          : roles;
        const permissionMap = await getStoredRolePermissionMap(
          prisma,
          filtered.map((row) => row.key)
        );

        res.json({
          items: filtered.map((row) =>
            toAdminRole({
              ...row,
              permissionsJson: permissionMap.get(row.key) ?? undefined
            })
          ),
          total: filtered.length
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/roles",
    authMiddleware,
    requireAdminPermissions("roles.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const key = normalizeRoleKeyInput(req.body?.key);
        const labelDe = ensureStringBody(req.body?.labelDe).trim();
        const descriptionDe = toOptionalTrimmedString(req.body?.descriptionDe);

        if (!key || !labelDe) {
          res.status(400).json({ ok: false, message: "key and labelDe are required." });
          return;
        }

        const existing = await prisma.role.findUnique({
          where: {
            key
          }
        });

        if (existing) {
          res.status(409).json({ ok: false, message: "Role key already exists." });
          return;
        }

        const requestedPermissionKeys = parsePermissionKeys(req.body?.permissionKeys);
        const permissionKeys = getEditableRolePermissionKeys(
          requestedPermissionKeys.length ? requestedPermissionKeys : getDefaultPermissionKeys("READ_ONLY", "INTERNAL")
        );
        const permissionValidationMessage = getRolePermissionValidationMessage(permissionKeys);
        if (permissionValidationMessage) {
          res.status(400).json({ ok: false, message: permissionValidationMessage });
          return;
        }

        const created = await prisma.role.create({
          data: {
            key,
            labelDe,
            descriptionDe,
            isSystem: false
          }
        });
        await setStoredRolePermissionKeys(prisma, created.key, permissionKeys);

        await audit({
          actorUserId: req.authUser?.id,
          action: "ROLE_CREATED",
          req,
          metadata: {
            roleId: created.id,
            key: created.key
          }
        });

        res.status(201).json({
          ok: true,
          role: toAdminRole({
            ...created,
            permissionsJson: permissionKeys
          })
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/admin/roles/:id",
    authMiddleware,
    requireAdminPermissions("roles.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const roleId = req.params.id;
        const existing = await prisma.role.findUnique({
          where: {
            id: roleId
          }
        });

        if (!existing) {
          res.status(404).json({ ok: false, message: "Role not found." });
          return;
        }

        const hasKey = hasOwn(req.body, "key");
        const hasLabelDe = hasOwn(req.body, "labelDe");
        const hasDescriptionDe = hasOwn(req.body, "descriptionDe");
        const hasPermissionKeys = hasOwn(req.body, "permissionKeys");
        const existingPermissionKeys = await getStoredRolePermissionKeys(prisma, existing.key);

        const key = hasKey ? normalizeRoleKeyInput(req.body?.key) : existing.key;
        const labelDe = hasLabelDe ? ensureStringBody(req.body?.labelDe).trim() : existing.labelDe;
        const descriptionDe = hasDescriptionDe ? toOptionalTrimmedString(req.body?.descriptionDe) : existing.descriptionDe;

        if (hasKey && !key) {
          res.status(400).json({ ok: false, message: "Invalid role key." });
          return;
        }

        if (hasLabelDe && !labelDe) {
          res.status(400).json({ ok: false, message: "labelDe is required." });
          return;
        }

        if (existing.isSystem && hasKey && key !== existing.key) {
          res.status(400).json({ ok: false, message: "System role key cannot be changed." });
          return;
        }

        if (existing.isSystem && hasPermissionKeys) {
          res.status(400).json({ ok: false, message: "System role permissions cannot be changed." });
          return;
        }

        const nextKey = key ?? existing.key;

        if (hasKey && nextKey !== existing.key) {
          const duplicate = await prisma.role.findUnique({
            where: {
              key: nextKey
            }
          });
          if (duplicate && duplicate.id !== existing.id) {
            res.status(409).json({ ok: false, message: "Role key already exists." });
            return;
          }
        }

        const data: Prisma.RoleUpdateInput = {};
        const changedFields: string[] = [];

        if (nextKey !== existing.key) {
          data.key = nextKey;
          changedFields.push("key");
        }

        if (labelDe !== existing.labelDe) {
          data.labelDe = labelDe;
          changedFields.push("labelDe");
        }

        if ((descriptionDe ?? null) !== (existing.descriptionDe ?? null)) {
          data.descriptionDe = descriptionDe ?? null;
          changedFields.push("descriptionDe");
        }

        let nextPermissionKeys = existingPermissionKeys;
        if (hasPermissionKeys) {
          nextPermissionKeys = mergeEditableRolePermissionKeys({
            existingPermissionKeys,
            requestedPermissionKeys: parsePermissionKeys(req.body?.permissionKeys)
          });
          if (JSON.stringify(existingPermissionKeys) !== JSON.stringify(nextPermissionKeys)) {
            changedFields.push("permissionKeys");
          }
        }

        const permissionValidationMessage = getRolePermissionValidationMessage(nextPermissionKeys);
        if (permissionValidationMessage) {
          res.status(400).json({ ok: false, message: permissionValidationMessage });
          return;
        }

        if (changedFields.length === 0) {
          res.json({
            ok: true,
            role: toAdminRole({
              ...existing,
              permissionsJson: existingPermissionKeys
            })
          });
          return;
        }

        const updated = await prisma.role.update({
          where: {
            id: existing.id
          },
          data
        });
        if (hasPermissionKeys) {
          await setStoredRolePermissionKeys(prisma, updated.key, nextPermissionKeys);
        }

        await audit({
          actorUserId: req.authUser?.id,
          action: "ROLE_UPDATED",
          req,
          metadata: {
            roleId: updated.id,
            key: updated.key,
            changedFields
          }
        });

        res.json({
          ok: true,
          role: toAdminRole({
            ...updated,
            permissionsJson: nextPermissionKeys
          })
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/roles/:id/archive",
    authMiddleware,
    requireAdminPermissions("roles.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const roleId = req.params.id;
        const existing = await prisma.role.findUnique({
          where: {
            id: roleId
          }
        });

        if (!existing) {
          res.status(404).json({ ok: false, message: "Role not found." });
          return;
        }

        if (existing.isSystem) {
          res.status(400).json({ ok: false, message: "System roles cannot be archived." });
          return;
        }

        if (existing.isArchived) {
          const existingPermissionKeys = await getStoredRolePermissionKeys(prisma, existing.key);
          res.json({
            ok: true,
            role: toAdminRole({
              ...existing,
              permissionsJson: existingPermissionKeys
            })
          });
          return;
        }

        const assignedUsers = await prisma.user.count({
          where: {
            role: existing.key,
            isArchived: false
          }
        });

        if (assignedUsers > 0) {
          res.status(400).json({ ok: false, message: "Role is assigned to active users." });
          return;
        }

        const updated = await prisma.role.update({
          where: {
            id: existing.id
          },
          data: {
            isArchived: true
          }
        });

        await audit({
          actorUserId: req.authUser?.id,
          action: "ROLE_ARCHIVED",
          req,
          metadata: {
            roleId: updated.id,
            key: updated.key
          }
        });

        res.json({
          ok: true,
          role: toAdminRole({
            ...updated,
            permissionsJson: await getStoredRolePermissionKeys(prisma, updated.key)
          })
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/roles/:id/restore",
    authMiddleware,
    requireAdminPermissions("roles.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const roleId = req.params.id;
        const existing = await prisma.role.findUnique({
          where: {
            id: roleId
          }
        });

        if (!existing) {
          res.status(404).json({ ok: false, message: "Role not found." });
          return;
        }

        if (!existing.isArchived) {
          const existingPermissionKeys = await getStoredRolePermissionKeys(prisma, existing.key);
          res.json({
            ok: true,
            role: toAdminRole({
              ...existing,
              permissionsJson: existingPermissionKeys
            })
          });
          return;
        }

        const updated = await prisma.role.update({
          where: {
            id: existing.id
          },
          data: {
            isArchived: false
          }
        });

        await audit({
          actorUserId: req.authUser?.id,
          action: "ROLE_RESTORED",
          req,
          metadata: {
            roleId: updated.id,
            key: updated.key
          }
        });

        res.json({
          ok: true,
          role: toAdminRole({
            ...updated,
            permissionsJson: await getStoredRolePermissionKeys(prisma, updated.key)
          })
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/security",
    authMiddleware,
    requireAdminPermissions("security.view", "security.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const settings = await getEffectiveSecuritySettings(prisma, config);
        const now = new Date();
        const [
          totalUsers,
          activeUsers,
          archivedUsers,
          adminUsers,
          externalUsers,
          lockedUsers,
          usersMustChangePassword,
          mfaEnabledUsers,
          adminsWithoutMfa,
          auditRows
        ] = await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { isArchived: false } }),
          prisma.user.count({ where: { isArchived: true } }),
          prisma.user.count({ where: { isArchived: false, role: "ADMIN", type: "INTERNAL" } }),
          prisma.user.count({ where: { isArchived: false, type: "EXTERNAL" } }),
          prisma.user.count({
            where: {
              isArchived: false,
              lockedUntil: {
                gt: now
              }
            }
          }),
          prisma.user.count({
            where: {
              isArchived: false,
              mustChangePassword: true
            }
          }),
          prisma.user.count({
            where: {
              isArchived: false,
              mfaEnabled: true
            }
          }),
          prisma.user.count({
            where: {
              isArchived: false,
              role: "ADMIN",
              type: "INTERNAL",
              mfaEnabled: false
            }
          }),
          prisma.auditLog.findMany({
            where: {
              action: {
                in: [
                  "USER_CREATED",
                  "USER_UPDATED",
                  "USER_ARCHIVED",
                  "USER_RESTORED",
                  "USER_ROLE_CHANGED",
                  "USER_TYPE_CHANGED",
                  "USER_PASSWORD_CHANGE_REQUIRED_CHANGED",
                  "USER_PASSWORD_RESET_REQUESTED_BY_ADMIN",
                  "USER_PASSWORD_RESET_BY_ADMIN",
                  "USER_UNLOCKED",
                  "MFA_ENFORCED_CHANGED",
                  "USER_MFA_RESET_BY_ADMIN",
                  "ROLE_CREATED",
                  "ROLE_UPDATED",
                  "ROLE_ARCHIVED",
                  "ROLE_RESTORED",
                  "SECURITY_SETTINGS_UPDATED"
                ]
              }
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 25,
            include: {
              actorUser: {
                select: {
                  firstName: true,
                  lastName: true
                }
              },
              targetUser: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          })
        ]);

        const summary: SecuritySummaryDto = {
          totalUsers,
          activeUsers,
          archivedUsers,
          adminUsers,
          externalUsers,
          lockedUsers,
          usersMustChangePassword,
          mfaEnabledUsers,
          adminsWithoutMfa,
          entraEnabled: config.authEnableEntra
        };

        const warnings = [
          adminUsers === 0 ? "Kein aktiver ADMIN-Benutzer vorhanden." : null,
          adminsWithoutMfa > 0 ? `${adminsWithoutMfa} aktive Admin-Konten ohne MFA.` : null,
          lockedUsers > 0 ? `${lockedUsers} Benutzerkonten sind derzeit gesperrt.` : null,
          usersMustChangePassword > 0
            ? `${usersMustChangePassword} Benutzer muessen ihr Passwort beim naechsten Login aendern.`
            : null,
          !settings.allowExternalUsers && externalUsers > 0
            ? "Externe Benutzer sind global gesperrt; bestehende externe Konten koennen sich nicht anmelden."
            : null
        ].filter((value): value is string => Boolean(value));

        res.json({
          settings: toSecuritySettingsDto(settings),
          summary,
          warnings,
          auditEvents: auditRows.map((entry) =>
            toSecurityAuditEvent({
              id: entry.id,
              action: entry.action,
              createdAt: entry.createdAt,
              metadataJson: entry.metadataJson,
              actorUserId: entry.actorUserId,
              targetUserId: entry.targetUserId,
              actor: entry.actorUser,
              target: entry.targetUser
            })
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/admin/security",
    authMiddleware,
    requireAdminPermissions("security.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const current = await getEffectiveSecuritySettings(prisma, config);
        const rawInput = {
          passwordMinLength:
            typeof req.body?.passwordMinLength === "number"
              ? req.body.passwordMinLength
              : typeof req.body?.passwordMinLength === "string"
                ? Number.parseInt(req.body.passwordMinLength, 10)
                : undefined,
          passwordRequireNumberOrSpecial:
            typeof req.body?.passwordRequireNumberOrSpecial === "boolean"
              ? req.body.passwordRequireNumberOrSpecial
              : undefined,
          maxFailedLoginAttempts:
            typeof req.body?.maxFailedLoginAttempts === "number"
              ? req.body.maxFailedLoginAttempts
              : typeof req.body?.maxFailedLoginAttempts === "string"
                ? Number.parseInt(req.body.maxFailedLoginAttempts, 10)
                : undefined,
          lockoutMinutes:
            typeof req.body?.lockoutMinutes === "number"
              ? req.body.lockoutMinutes
              : typeof req.body?.lockoutMinutes === "string"
                ? Number.parseInt(req.body.lockoutMinutes, 10)
                : undefined,
          sessionTtlDays:
            typeof req.body?.sessionTtlDays === "number"
              ? req.body.sessionTtlDays
              : typeof req.body?.sessionTtlDays === "string"
                ? Number.parseInt(req.body.sessionTtlDays, 10)
                : undefined,
          allowExternalUsers:
            typeof req.body?.allowExternalUsers === "boolean" ? req.body.allowExternalUsers : undefined
        } satisfies Partial<SecuritySettingsDto>;

        const nextSettings = sanitizeSecuritySettingsInput(rawInput, current);
        const changedFields = Object.entries(nextSettings)
          .filter(([key, value]) => current[key as keyof SecuritySettingsDto] !== value)
          .map(([key]) => key);

        if (changedFields.length === 0) {
          res.json({
            ok: true,
            settings: toSecuritySettingsDto(current)
          });
          return;
        }

        await saveSecuritySettings(prisma, nextSettings);

        let revokedExternalSessions = 0;
        let deletedExternalChallenges = 0;
        const externalAccessWasDisabled = current.allowExternalUsers && !nextSettings.allowExternalUsers;

        if (externalAccessWasDisabled) {
          const externalUsers = await prisma.user.findMany({
            where: {
              type: "EXTERNAL"
            },
            select: {
              id: true
            }
          });

          const externalUserIds = externalUsers.map((user) => user.id);
          if (externalUserIds.length > 0) {
            const now = new Date();
            const [revokedSessionsResult, deletedChallengesResult] = await prisma.$transaction([
              prisma.session.updateMany({
                where: {
                  userId: {
                    in: externalUserIds
                  },
                  revokedAt: null
                },
                data: {
                  revokedAt: now
                }
              }),
              prisma.mfaChallenge.deleteMany({
                where: {
                  userId: {
                    in: externalUserIds
                  }
                }
              })
            ]);

            revokedExternalSessions = revokedSessionsResult.count;
            deletedExternalChallenges = deletedChallengesResult.count;
          }
        }

        await audit({
          actorUserId: req.authUser?.id,
          action: "SECURITY_SETTINGS_UPDATED",
          req,
          metadata: {
            changedFields,
            nextSettings,
            revokedExternalSessions,
            deletedExternalChallenges
          }
        });

        res.json({
          ok: true,
          settings: toSecuritySettingsDto(nextSettings)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/notifications/overview",
    authMiddleware,
    requireAdminPermissions("notifications.view", "notifications.retry", "notifications.settings.manage"),
    async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const overview = await getAdminNotificationOverview(prisma, config);
        res.json({
          ...overview,
          settings: toNotificationSettingsDto(overview.settings)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/notifications",
    authMiddleware,
    requireAdminPermissions("notifications.view", "notifications.retry", "notifications.settings.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const result = await listAdminNotifications(prisma, config, {
          q: toOptionalTrimmedString(req.query.q ?? req.query.search),
          recipient: toOptionalTrimmedString(req.query.recipient),
          status: toOptionalTrimmedString(req.query.status)?.toUpperCase(),
          eventType: toOptionalTrimmedString(req.query.eventType)?.toUpperCase(),
          entityType: toOptionalTrimmedString(req.query.entityType)?.toUpperCase(),
          dateFrom: toOptionalTrimmedString(req.query.dateFrom),
          dateTo: toOptionalTrimmedString(req.query.dateTo),
          page: parsePositiveInteger(req.query.page, DEFAULT_ADMIN_PAGE, MAX_ADMIN_PAGE_SIZE),
          pageSize: parsePositiveInteger(req.query.pageSize, DEFAULT_ADMIN_PAGE_SIZE, MAX_ADMIN_PAGE_SIZE)
        });

        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/notifications/settings",
    authMiddleware,
    requireAdminPermissions("notifications.view", "notifications.settings.manage"),
    async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const settings = await getEffectiveNotificationSettings(prisma);
        res.json({
          settings: toNotificationSettingsDto(settings)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/admin/notifications/settings",
    authMiddleware,
    requireAdminPermissions("notifications.settings.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const current = await getEffectiveNotificationSettings(prisma);
        const rawInput = {
          defaultDueSoonDays:
            typeof req.body?.defaultDueSoonDays === "number"
              ? req.body.defaultDueSoonDays
              : typeof req.body?.defaultDueSoonDays === "string"
                ? Number.parseInt(req.body.defaultDueSoonDays, 10)
                : undefined,
          deadlineDueSoonEnabled:
            typeof req.body?.deadlineDueSoonEnabled === "boolean" ? req.body.deadlineDueSoonEnabled : undefined,
          assignmentAssignedEnabled:
            typeof req.body?.assignmentAssignedEnabled === "boolean" ? req.body.assignmentAssignedEnabled : undefined,
          dailyDigestEnabled:
            typeof req.body?.dailyDigestEnabled === "boolean" ? req.body.dailyDigestEnabled : undefined,
          weeklyDigestEnabled:
            typeof req.body?.weeklyDigestEnabled === "boolean" ? req.body.weeklyDigestEnabled : undefined,
          dailyDigestHourLocal:
            typeof req.body?.dailyDigestHourLocal === "number"
              ? req.body.dailyDigestHourLocal
              : typeof req.body?.dailyDigestHourLocal === "string"
                ? Number.parseInt(req.body.dailyDigestHourLocal, 10)
                : undefined,
          weeklyDigestWeekday:
            typeof req.body?.weeklyDigestWeekday === "number"
              ? req.body.weeklyDigestWeekday
              : typeof req.body?.weeklyDigestWeekday === "string"
                ? Number.parseInt(req.body.weeklyDigestWeekday, 10)
                : undefined
        } satisfies Partial<NotificationSettingsDto>;

        const nextSettings = sanitizeNotificationSettingsInput(rawInput, current);
        const changedFields = Object.entries(nextSettings)
          .filter(([key, value]) => current[key as keyof NotificationSettingsDto] !== value)
          .map(([key]) => key);

        if (changedFields.length === 0) {
          res.json({
            ok: true,
            settings: toNotificationSettingsDto(current)
          });
          return;
        }

        await saveNotificationSettings(prisma, nextSettings);
        await audit({
          actorUserId: req.authUser?.id,
          action: "NOTIFICATION_SETTINGS_UPDATED",
          req,
          metadata: {
            changedFields,
            nextSettings
          }
        });

        res.json({
          ok: true,
          settings: toNotificationSettingsDto(nextSettings)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/notifications/:id",
    authMiddleware,
    requireAdminPermissions("notifications.view", "notifications.retry", "notifications.settings.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const notificationId = toOptionalTrimmedString(req.params.id);
        if (!notificationId) {
          res.status(400).json({ ok: false, message: "Notification id is required." });
          return;
        }

        const detail = await getAdminNotificationDetail(prisma, config, notificationId);
        if (!detail) {
          res.status(404).json({ ok: false, message: "Notification not found." });
          return;
        }

        res.json(detail);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/notifications/:id/retry",
    authMiddleware,
    requireAdminPermissions("notifications.retry"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const notificationId = toOptionalTrimmedString(req.params.id);
        if (!notificationId) {
          res.status(400).json({ ok: false, message: "Notification id is required." });
          return;
        }

        const result = await retryAdminNotification(prisma, config, notificationId);
        if (result.kind === "missing") {
          res.status(404).json({ ok: false, message: "Notification not found." });
          return;
        }
        if (result.kind === "conflict") {
          res.status(409).json({ ok: false, message: result.message });
          return;
        }
        if (result.kind === "forbidden" || result.kind === "invalid") {
          res.status(400).json({ ok: false, message: result.message });
          return;
        }

        await audit({
          actorUserId: req.authUser?.id,
          action: "NOTIFICATION_RETRY_REQUESTED",
          req,
          metadata: {
            notificationId
          }
        });

        res.json({
          ok: true,
          notification: result.entry
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/notifications/:id/cancel",
    authMiddleware,
    requireAdminPermissions("notifications.retry"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const notificationId = toOptionalTrimmedString(req.params.id);
        if (!notificationId) {
          res.status(400).json({ ok: false, message: "Notification id is required." });
          return;
        }

        const result = await cancelAdminNotification(prisma, config, notificationId);
        if (result.kind === "missing") {
          res.status(404).json({ ok: false, message: "Notification not found." });
          return;
        }
        if (result.kind === "conflict") {
          res.status(409).json({ ok: false, message: result.message });
          return;
        }
        if (result.kind === "invalid") {
          res.status(400).json({ ok: false, message: result.message });
          return;
        }

        await audit({
          actorUserId: req.authUser?.id,
          action: "NOTIFICATION_CANCELLED_BY_ADMIN",
          req,
          metadata: {
            notificationId
          }
        });

        res.json({
          ok: true,
          notification: result.entry
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/external-orgs/lookup",
    authMiddleware,
    requireAdminPermissions("externalOrgs.view", "users.manage"),
    async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const organizations = await prisma.externalOrganization.findMany({
          where: {
            isArchived: false
          },
          orderBy: {
            name: "asc"
          }
        });

        res.json({
          items: organizations.map((row) => toExternalOrganization(row)),
          total: organizations.length
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/external-orgs",
    authMiddleware,
    requireAdminPermissions("externalOrgs.view"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const search = toOptionalTrimmedString(req.query.q ?? req.query.search)?.toLowerCase();
        const archived = parseArchivedFilter(req.query.archived);

        const organizations = await prisma.externalOrganization.findMany({
          where: {
            isArchived: archived === "all" ? undefined : archived === "true"
          },
          orderBy: {
            name: "asc"
          }
        });

        const filtered = search
          ? organizations.filter((row) =>
              `${row.name} ${row.type} ${row.email ?? ""} ${row.phone ?? ""} ${row.address ?? ""}`
                .toLowerCase()
                .includes(search)
            )
          : organizations;

        res.json({
          items: filtered.map((row) => toExternalOrganization(row)),
          total: filtered.length
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/external-orgs",
    authMiddleware,
    requireAdminPermissions("externalOrgs.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const name = ensureStringBody(req.body?.name).trim();
        const type = ensureStringBody(req.body?.type).trim();
        const phone = toOptionalTrimmedString(req.body?.phone);
        const email = toOptionalTrimmedString(req.body?.email);
        const address = toOptionalTrimmedString(req.body?.address);

        if (!name || !type) {
          res.status(400).json({ ok: false, message: "name and type are required." });
          return;
        }

        if (email && !isValidEmail(email)) {
          res.status(400).json({ ok: false, message: "Invalid email format." });
          return;
        }

        const existing = await prisma.externalOrganization.findUnique({
          where: {
            name
          }
        });

        if (existing) {
          res.status(409).json({ ok: false, message: "External organization already exists." });
          return;
        }

        const created = await prisma.externalOrganization.create({
          data: {
            name,
            type,
            phone,
            email,
            address
          }
        });

        await audit({
          actorUserId: req.authUser?.id,
          action: "EXTERNAL_ORG_CREATED",
          req,
          metadata: {
            externalOrgId: created.id,
            name: created.name
          }
        });

        res.status(201).json({
          ok: true,
          externalOrg: toExternalOrganization(created)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/admin/external-orgs/:id",
    authMiddleware,
    requireAdminPermissions("externalOrgs.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const externalOrgId = req.params.id;
        const existing = await prisma.externalOrganization.findUnique({
          where: {
            id: externalOrgId
          }
        });

        if (!existing) {
          res.status(404).json({ ok: false, message: "External organization not found." });
          return;
        }

        const hasName = hasOwn(req.body, "name");
        const hasType = hasOwn(req.body, "type");
        const hasPhone = hasOwn(req.body, "phone");
        const hasEmail = hasOwn(req.body, "email");
        const hasAddress = hasOwn(req.body, "address");

        const name = hasName ? ensureStringBody(req.body?.name).trim() : existing.name;
        const type = hasType ? ensureStringBody(req.body?.type).trim() : existing.type;
        const phone = hasPhone ? toOptionalTrimmedString(req.body?.phone) : existing.phone;
        const email = hasEmail ? toOptionalTrimmedString(req.body?.email) : existing.email;
        const address = hasAddress ? toOptionalTrimmedString(req.body?.address) : existing.address;

        if (hasName && !name) {
          res.status(400).json({ ok: false, message: "name is required." });
          return;
        }

        if (hasType && !type) {
          res.status(400).json({ ok: false, message: "type is required." });
          return;
        }

        if (email && !isValidEmail(email)) {
          res.status(400).json({ ok: false, message: "Invalid email format." });
          return;
        }

        if (name !== existing.name) {
          const duplicate = await prisma.externalOrganization.findUnique({
            where: {
              name
            }
          });
          if (duplicate && duplicate.id !== existing.id) {
            res.status(409).json({ ok: false, message: "External organization already exists." });
            return;
          }
        }

        const data: Prisma.ExternalOrganizationUpdateInput = {};
        const changedFields: string[] = [];

        if (name !== existing.name) {
          data.name = name;
          changedFields.push("name");
        }

        if (type !== existing.type) {
          data.type = type;
          changedFields.push("type");
        }

        if ((phone ?? null) !== (existing.phone ?? null)) {
          data.phone = phone ?? null;
          changedFields.push("phone");
        }

        if ((email ?? null) !== (existing.email ?? null)) {
          data.email = email ?? null;
          changedFields.push("email");
        }

        if ((address ?? null) !== (existing.address ?? null)) {
          data.address = address ?? null;
          changedFields.push("address");
        }

        if (changedFields.length === 0) {
          res.json({
            ok: true,
            externalOrg: toExternalOrganization(existing)
          });
          return;
        }

        const updated = await prisma.externalOrganization.update({
          where: {
            id: existing.id
          },
          data
        });

        await audit({
          actorUserId: req.authUser?.id,
          action: "EXTERNAL_ORG_UPDATED",
          req,
          metadata: {
            externalOrgId: updated.id,
            changedFields
          }
        });

        res.json({
          ok: true,
          externalOrg: toExternalOrganization(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/external-orgs/:id/archive",
    authMiddleware,
    requireAdminPermissions("externalOrgs.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const externalOrgId = req.params.id;
        const existing = await prisma.externalOrganization.findUnique({
          where: {
            id: externalOrgId
          }
        });

        if (!existing) {
          res.status(404).json({ ok: false, message: "External organization not found." });
          return;
        }

        if (existing.isArchived) {
          res.json({ ok: true, externalOrg: toExternalOrganization(existing) });
          return;
        }

        const assignedUsers = await prisma.user.count({
          where: {
            externalOrgId: existing.id,
            isArchived: false
          }
        });

        if (assignedUsers > 0) {
          res.status(400).json({ ok: false, message: "External organization is assigned to active users." });
          return;
        }

        const updated = await prisma.externalOrganization.update({
          where: {
            id: existing.id
          },
          data: {
            isArchived: true
          }
        });

        await audit({
          actorUserId: req.authUser?.id,
          action: "EXTERNAL_ORG_ARCHIVED",
          req,
          metadata: {
            externalOrgId: updated.id,
            name: updated.name
          }
        });

        res.json({
          ok: true,
          externalOrg: toExternalOrganization(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/external-orgs/:id/restore",
    authMiddleware,
    requireAdminPermissions("externalOrgs.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const externalOrgId = req.params.id;
        const existing = await prisma.externalOrganization.findUnique({
          where: {
            id: externalOrgId
          }
        });

        if (!existing) {
          res.status(404).json({ ok: false, message: "External organization not found." });
          return;
        }

        if (!existing.isArchived) {
          res.json({ ok: true, externalOrg: toExternalOrganization(existing) });
          return;
        }

        const updated = await prisma.externalOrganization.update({
          where: {
            id: existing.id
          },
          data: {
            isArchived: false
          }
        });

        await audit({
          actorUserId: req.authUser?.id,
          action: "EXTERNAL_ORG_RESTORED",
          req,
          metadata: {
            externalOrgId: updated.id,
            name: updated.name
          }
        });

        res.json({
          ok: true,
          externalOrg: toExternalOrganization(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/users",
    authMiddleware,
    requireAdminPermissions("users.view", "users.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const search = toOptionalTrimmedString(req.query.q ?? req.query.search);
        const role = parseRole(req.query.role);
        const type = parseType(req.query.type);
        const archived = parseArchivedFilter(req.query.archived ?? (isTrue(req.query.includeArchived) ? "all" : undefined));
        const page = parsePositiveInteger(req.query.page, DEFAULT_ADMIN_PAGE);
        const pageSize = parsePositiveInteger(req.query.pageSize, DEFAULT_ADMIN_PAGE_SIZE, MAX_ADMIN_PAGE_SIZE);
        const sort = parseAdminSortField(req.query.sort);
        const dir = parseSortDirection(req.query.dir);

        const users = await prisma.user.findMany({
          where: {
            isArchived: archived === "all" ? undefined : archived === "true"
          },
          include: {
            externalOrg: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });

        const normalizedSearch = search?.toLowerCase();

        const filtered = users
          .filter((row) => (role ? row.role === role : true))
          .filter((row) => (type ? row.type === type : true))
          .filter((row) => (normalizedSearch ? toSearchable(row).includes(normalizedSearch) : true))
          .sort((left, right) => {
            const base = compareAdminUsers(left, right, sort);
            return dir === "asc" ? base : base * -1;
          });

        const total = filtered.length;
        const offset = (page - 1) * pageSize;
        const items = filtered.slice(offset, offset + pageSize).map((row) => toAdminUserListItem(row));

        res.json({
          items,
          total,
          page,
          pageSize
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/users",
    authMiddleware,
    requireAdminPermissions("users.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const securitySettings = await getEffectiveSecuritySettings(prisma, config);
        const firstName = ensureStringBody(req.body?.firstName).trim();
        const lastName = ensureStringBody(req.body?.lastName).trim();
        const email = normalizeEmail(ensureStringBody(req.body?.email));
        const phone = toOptionalTrimmedString(req.body?.phone);
        const requestedRole = parseRole(req.body?.role);
        const requestedType = parseType(req.body?.type);
        const titleOrPosition = toOptionalTrimmedString(req.body?.titleOrPosition);
        const department = toOptionalTrimmedString(req.body?.department);
        const externalCompany = toOptionalTrimmedString(req.body?.externalCompany);
        const externalOrgIdInput = toOptionalTrimmedString(req.body?.externalOrgId);
        const notes = toOptionalTrimmedString(req.body?.notes);
        const initialPassword = toOptionalTrimmedString(req.body?.initialPassword);
        const requestedPasswordMode = parsePasswordMode(req.body?.passwordMode);

        if (!firstName || !lastName || !email) {
          res.status(400).json({ ok: false, message: "firstName, lastName and email are required." });
          return;
        }

        if (!isValidEmail(email)) {
          res.status(400).json({ ok: false, message: "Invalid email format." });
          return;
        }

        if (!requestedRole || !requestedType) {
          res.status(400).json({ ok: false, message: "role and type are required." });
          return;
        }

        const existing = await prisma.user.findUnique({
          where: {
            email
          }
        });

        if (existing) {
          res.status(409).json({ ok: false, message: "Email already exists." });
          return;
        }

        const roleAndType = getRoleAndType({
          role: requestedRole,
          type: requestedType,
          fallbackRole: "USER",
          fallbackType: "INTERNAL"
        });

        const assignableRole = await findAssignableRole(roleAndType.role);
        if (!assignableRole) {
          res.status(400).json({ ok: false, message: "Role does not exist or is archived." });
          return;
        }

        let externalOrg: { id: string; name: string } | null = null;
        if (roleAndType.type === "EXTERNAL") {
          if (!externalOrgIdInput) {
            res.status(400).json({ ok: false, message: "externalOrgId is required for external users." });
            return;
          }

          const found = await findActiveExternalOrganization(externalOrgIdInput);
          if (!found) {
            res.status(400).json({ ok: false, message: "Invalid externalOrgId." });
            return;
          }
          externalOrg = {
            id: found.id,
            name: found.name
          };
        }

        const passwordMode = requestedPasswordMode ?? (initialPassword ? "manual" : "link");
        if ((passwordMode === "manual" && !initialPassword) || (passwordMode === "link" && initialPassword)) {
          res.status(400).json({ ok: false, message: "Invalid passwordMode for the provided input." });
          return;
        }

        const generatedPassword = passwordMode === "auto" ? generateTemporaryPassword() : undefined;
        let effectivePassword: string;
        if (passwordMode === "manual") {
          effectivePassword = initialPassword ?? "";
        } else if (passwordMode === "auto") {
          effectivePassword = generatedPassword ?? generateTemporaryPassword();
        } else {
          effectivePassword = generateTemporaryPassword();
        }
        const passwordValidation = validateManagedPassword(effectivePassword, {
          minLength: securitySettings.passwordMinLength,
          requireNumberOrSpecial: securitySettings.passwordRequireNumberOrSpecial
        });
        if (!passwordValidation.valid) {
          res.status(400).json({ ok: false, message: passwordValidation.message });
          return;
        }

        const now = new Date();
        const passwordHash = await hashPassword(effectivePassword);

        const created = await prisma.user.create({
          data: {
            firstName,
            lastName,
            email,
            phone,
            role: roleAndType.role,
            type: roleAndType.type,
            titleOrPosition,
            department,
            externalOrgId: roleAndType.type === "EXTERNAL" ? (externalOrg?.id ?? null) : null,
            externalCompany: roleAndType.type === "EXTERNAL" ? (externalOrg?.name ?? externalCompany ?? null) : null,
            notes,
            passwordHash,
            passwordUpdatedAt: now,
            mustChangePassword: passwordMode !== "link",
            invitedAt: passwordMode === "link" ? now : null,
            lastPasswordResetAt: now
          },
          include: {
            externalOrg: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });

        let resetLink: string | undefined;
        let temporaryPassword: string | undefined;
        let notificationStatus: "SENT" | "FAILED" | undefined;
        let notificationError: string | undefined;

        if (passwordMode === "link") {
          try {
            const reset = await createAndDispatchPasswordResetNotification(prisma, config, {
              user: created,
              ttlMinutes: config.resetTokenTtlMinutes
            });

            resetLink = reset.resetLink;
            notificationStatus = reset.deliveryStatus;
            notificationError = reset.deliveryError;

            await audit({
              actorUserId: req.authUser?.id,
              targetUserId: created.id,
              action: "USER_INVITED",
              req,
              metadata: {
                expiresAt: reset.expiresAt.toISOString(),
                notificationId: reset.notificationId,
                deliveryStatus: reset.deliveryStatus,
                deliveryError: reset.deliveryError
              }
            });
          } catch (notificationErrorValue) {
            notificationStatus = "FAILED";
            notificationError =
              notificationErrorValue instanceof Error
                ? notificationErrorValue.message
                : "Initial invite dispatch failed.";
          }
        } else if (passwordMode === "auto" && generatedPassword) {
          temporaryPassword = generatedPassword;
        }

        await audit({
          actorUserId: req.authUser?.id,
          targetUserId: created.id,
          action: "USER_CREATED",
          req,
          metadata: {
            role: created.role,
            type: created.type,
            passwordMode,
            mustChangePassword: passwordMode !== "link"
          }
        });

        res.status(201).json({
          ok: true,
          user: toSafeUser(created),
          resetLink,
          temporaryPassword,
          notificationStatus,
          notificationError
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/admin/users/:id",
    authMiddleware,
    requireAdminPermissions("users.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.params.id;

        const existing = await prisma.user.findUnique({
          where: {
            id: userId
          },
          include: {
            externalOrg: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });

        if (!existing) {
          res.status(404).json({ ok: false, message: "User not found." });
          return;
        }

        const hasFirstName = hasOwn(req.body, "firstName");
        const hasLastName = hasOwn(req.body, "lastName");
        const hasEmail = hasOwn(req.body, "email");
        const hasPhone = hasOwn(req.body, "phone");
        const hasRole = hasOwn(req.body, "role");
        const hasType = hasOwn(req.body, "type");
        const hasTitle = hasOwn(req.body, "titleOrPosition");
        const hasDepartment = hasOwn(req.body, "department");
        const hasExternalCompany = hasOwn(req.body, "externalCompany");
        const hasExternalOrgId = hasOwn(req.body, "externalOrgId");
        const hasNotes = hasOwn(req.body, "notes");
        const hasMfaEnforced = hasOwn(req.body, "mfaEnforced");
        const hasMustChangePassword = hasOwn(req.body, "mustChangePassword");

        const firstName = toOptionalTrimmedString(req.body?.firstName);
        const lastName = toOptionalTrimmedString(req.body?.lastName);
        const email = toOptionalTrimmedString(req.body?.email);
        const phone = toOptionalTrimmedString(req.body?.phone);
        const requestedRole = hasRole ? parseRole(req.body?.role) : null;
        const requestedType = hasType ? parseType(req.body?.type) : null;
        const requestedMfaEnforced = hasMfaEnforced ? parseBoolean(req.body?.mfaEnforced) : null;
        const requestedMustChangePassword = hasMustChangePassword ? parseBoolean(req.body?.mustChangePassword) : null;
        const titleOrPosition = toOptionalTrimmedString(req.body?.titleOrPosition);
        const department = toOptionalTrimmedString(req.body?.department);
        const externalCompany = toOptionalTrimmedString(req.body?.externalCompany);
        const externalOrgIdInput = hasExternalOrgId
          ? toOptionalTrimmedString(req.body?.externalOrgId)
          : existing.externalOrgId ?? undefined;
        const notes = toOptionalTrimmedString(req.body?.notes);

        if (hasFirstName && !firstName) {
          res.status(400).json({ ok: false, message: "firstName is required." });
          return;
        }

        if (hasLastName && !lastName) {
          res.status(400).json({ ok: false, message: "lastName is required." });
          return;
        }

        if (hasEmail && !email) {
          res.status(400).json({ ok: false, message: "email is required." });
          return;
        }

        if (hasRole && !requestedRole) {
          res.status(400).json({ ok: false, message: "Invalid role." });
          return;
        }

        if (hasType && !requestedType) {
          res.status(400).json({ ok: false, message: "Invalid type." });
          return;
        }

        if (hasMfaEnforced && requestedMfaEnforced === null) {
          res.status(400).json({ ok: false, message: "Invalid mfaEnforced value." });
          return;
        }

        if (hasMustChangePassword && requestedMustChangePassword === null) {
          res.status(400).json({ ok: false, message: "Invalid mustChangePassword value." });
          return;
        }

        const normalizedEmail = email ? normalizeEmail(email) : undefined;
        if (normalizedEmail && !isValidEmail(normalizedEmail)) {
          res.status(400).json({ ok: false, message: "Invalid email format." });
          return;
        }

        if (normalizedEmail && normalizedEmail !== existing.email) {
          const byEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
          if (byEmail && byEmail.id !== existing.id) {
            res.status(409).json({ ok: false, message: "Email already exists." });
            return;
          }
        }

        const roleAndType = getRoleAndType({
          role: requestedRole,
          type: requestedType,
          fallbackRole: normalizeRoleValue(existing.role),
          fallbackType: normalizeTypeValue(existing.type)
        });

        const normalizedExistingRole = normalizeRoleValue(existing.role);
        const roleChanged = roleAndType.role !== normalizedExistingRole;
        if (hasRole || roleChanged) {
          const assignableRole = await findAssignableRole(roleAndType.role);
          if (!assignableRole) {
            res.status(400).json({ ok: false, message: "Role does not exist or is archived." });
            return;
          }
        }

        let externalOrg: { id: string; name: string } | null = null;
        if (roleAndType.type === "EXTERNAL") {
          if (!externalOrgIdInput) {
            res.status(400).json({ ok: false, message: "externalOrgId is required for external users." });
            return;
          }

          const found = await findActiveExternalOrganization(externalOrgIdInput);
          if (!found) {
            res.status(400).json({ ok: false, message: "Invalid externalOrgId." });
            return;
          }
          externalOrg = {
            id: found.id,
            name: found.name
          };
        }

        const isExistingAdmin =
          normalizeRoleValue(existing.role) === "ADMIN" && normalizeTypeValue(existing.type) === "INTERNAL";
        const willRemainAdmin = roleAndType.role === "ADMIN" && roleAndType.type === "INTERNAL";
        const isDemotingAdmin = isExistingAdmin && !willRemainAdmin;
        if (isDemotingAdmin) {
          const hasBackupAdmin = await hasOtherActiveAdmin(existing.id);
          if (!hasBackupAdmin) {
            res.status(400).json({
              ok: false,
              message:
                req.authUser?.id === existing.id
                  ? "You cannot remove your own ADMIN role as the last active admin."
                  : "At least one active ADMIN user is required."
            });
            return;
          }
        }

        const data: Prisma.UserUncheckedUpdateInput = {
          role: roleAndType.role,
          type: roleAndType.type
        };

        const changedFields: string[] = [];

        if (hasFirstName && firstName && firstName !== existing.firstName) {
          data.firstName = firstName;
          changedFields.push("firstName");
        }

        if (hasLastName && lastName && lastName !== existing.lastName) {
          data.lastName = lastName;
          changedFields.push("lastName");
        }

        if (hasEmail && normalizedEmail && normalizedEmail !== existing.email) {
          data.email = normalizedEmail;
          changedFields.push("email");
        }

        if (hasPhone) {
          data.phone = phone ?? null;
          if ((existing.phone ?? null) !== (phone ?? null)) {
            changedFields.push("phone");
          }
        }

        if (hasTitle) {
          data.titleOrPosition = titleOrPosition ?? null;
          if ((existing.titleOrPosition ?? null) !== (titleOrPosition ?? null)) {
            changedFields.push("titleOrPosition");
          }
        }

        if (hasDepartment) {
          data.department = department ?? null;
          if ((existing.department ?? null) !== (department ?? null)) {
            changedFields.push("department");
          }
        }

        if (hasExternalCompany || hasExternalOrgId || roleAndType.type !== "EXTERNAL") {
          const nextExternalOrgId = roleAndType.type === "EXTERNAL" ? (externalOrg?.id ?? null) : null;
          const nextExternalCompany =
            roleAndType.type === "EXTERNAL"
              ? (externalOrg?.name || externalCompany || existing.externalCompany || null)
              : null;

          data.externalOrgId = nextExternalOrgId;
          data.externalCompany = nextExternalCompany;

          if ((existing.externalOrgId ?? null) !== nextExternalOrgId) {
            changedFields.push("externalOrgId");
          }

          if ((existing.externalCompany ?? null) !== nextExternalCompany) {
            changedFields.push("externalCompany");
          }
        }

        if (hasNotes) {
          data.notes = notes ?? null;
          if ((existing.notes ?? null) !== (notes ?? null)) {
            changedFields.push("notes");
          }
        }

        if (hasMfaEnforced && requestedMfaEnforced !== null) {
          data.mfaEnforced = requestedMfaEnforced;
          if (existing.mfaEnforced !== requestedMfaEnforced) {
            changedFields.push("mfaEnforced");
          }
        }

        if (hasMustChangePassword && requestedMustChangePassword !== null) {
          data.mustChangePassword = requestedMustChangePassword;
          if (existing.mustChangePassword !== requestedMustChangePassword) {
            changedFields.push("mustChangePassword");
          }
        }

        if (roleAndType.role !== normalizeRoleValue(existing.role)) {
          changedFields.push("role");
        }

        if (roleAndType.type !== normalizeTypeValue(existing.type)) {
          changedFields.push("type");
        }

        const updated = await prisma.user.update({
          where: {
            id: userId
          },
          data,
          include: {
            externalOrg: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });

        await audit({
          actorUserId: req.authUser?.id,
          targetUserId: updated.id,
          action: "USER_UPDATED",
          req,
          metadata: {
            changedFields
          }
        });

        if (normalizeRoleValue(existing.role) !== normalizeRoleValue(updated.role)) {
          await audit({
            actorUserId: req.authUser?.id,
            targetUserId: updated.id,
            action: "USER_ROLE_CHANGED",
            req,
            metadata: {
              from: normalizeRoleValue(existing.role),
              to: normalizeRoleValue(updated.role)
            }
          });
        }

        if (normalizeTypeValue(existing.type) !== normalizeTypeValue(updated.type)) {
          await audit({
            actorUserId: req.authUser?.id,
            targetUserId: updated.id,
            action: "USER_TYPE_CHANGED",
            req,
            metadata: {
              from: normalizeTypeValue(existing.type),
              to: normalizeTypeValue(updated.type)
            }
          });
        }

        if (existing.mfaEnforced !== updated.mfaEnforced) {
          await audit({
            actorUserId: req.authUser?.id,
            targetUserId: updated.id,
            action: "MFA_ENFORCED_CHANGED",
            req,
            metadata: {
              from: existing.mfaEnforced,
              to: updated.mfaEnforced
            }
          });
        }

        if (existing.mustChangePassword !== updated.mustChangePassword) {
          await audit({
            actorUserId: req.authUser?.id,
            targetUserId: updated.id,
            action: "USER_PASSWORD_CHANGE_REQUIRED_CHANGED",
            req,
            metadata: {
              from: existing.mustChangePassword,
              to: updated.mustChangePassword
            }
          });
        }

        res.json({
          ok: true,
          user: toSafeUser(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/users/:id/archive",
    authMiddleware,
    requireAdminPermissions("users.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.params.id;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ ok: false, message: "User not found." });
          return;
        }

        if (req.authUser?.id === user.id) {
          res.status(400).json({ ok: false, message: "You cannot archive your own account." });
          return;
        }

        if (!user.isArchived && normalizeRoleValue(user.role) === "ADMIN" && normalizeTypeValue(user.type) === "INTERNAL") {
          const hasBackupAdmin = await hasOtherActiveAdmin(user.id);
          if (!hasBackupAdmin) {
            res.status(400).json({ ok: false, message: "At least one active ADMIN user is required." });
            return;
          }
        }

        if (user.isArchived) {
          res.json({ ok: true, user: toSafeUser(user) });
          return;
        }

        const now = new Date();
        const [updated] = await prisma.$transaction([
          prisma.user.update({
            where: { id: userId },
            data: {
              isArchived: true,
              failedLoginCount: 0,
              lockedUntil: null
            }
          }),
          prisma.session.updateMany({
            where: {
              userId,
              revokedAt: null
            },
            data: {
              revokedAt: now
            }
          })
        ]);

        await audit({
          actorUserId: req.authUser?.id,
          targetUserId: userId,
          action: "USER_ARCHIVED",
          req
        });

        res.json({ ok: true, user: toSafeUser(updated) });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/users/:id/restore",
    authMiddleware,
    requireAdminPermissions("users.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.params.id;

        const existing = await prisma.user.findUnique({ where: { id: userId } });
        if (!existing) {
          res.status(404).json({ ok: false, message: "User not found." });
          return;
        }

        if (!existing.isArchived) {
          res.json({ ok: true, user: toSafeUser(existing) });
          return;
        }

        const updated = await prisma.user.update({
          where: {
            id: userId
          },
          data: {
            isArchived: false
          }
        });

        await audit({
          actorUserId: req.authUser?.id,
          targetUserId: userId,
          action: "USER_RESTORED",
          req
        });

        res.json({ ok: true, user: toSafeUser(updated) });
      } catch (error) {
        next(error);
      }
    }
  );

  const handleAdminResetPassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const securitySettings = await getEffectiveSecuritySettings(prisma, config);
      const userId = req.params.id;
      const requestedPasswordMode = parseAdminResetPasswordMode(req.body?.passwordMode);
      const temporaryPasswordInput = toOptionalTrimmedString(req.body?.temporaryPassword);
      const newPassword = ensureStringBody(req.body?.newPassword);
      const hasNewPassword = newPassword.trim().length > 0;

      const target = await prisma.user.findUnique({
        where: {
          id: userId
        }
      });

      if (!target || target.isArchived) {
        res.status(404).json({ ok: false, message: "User not found." });
        return;
      }

      if (req.authUser?.id === target.id) {
        res.status(400).json({
          ok: false,
          message: "Admins must use personal security settings to change their own password."
        });
        return;
      }

      if (!target.email.trim()) {
        res.status(400).json({
          ok: false,
          message: "User does not have a deliverable email address."
        });
        return;
      }

      if (String(target.type).trim().toUpperCase() === "EXTERNAL" && !(await getAllowExternalUsers(prisma))) {
        res.status(400).json({
          ok: false,
          message: "External users cannot receive password reset emails while external access is disabled."
        });
        return;
      }

      if (requestedPasswordMode && requestedPasswordMode !== "direct" && hasNewPassword) {
        res.status(400).json({ ok: false, message: "newPassword is only supported for direct password resets." });
        return;
      }

      const passwordMode =
        requestedPasswordMode === "direct" || hasNewPassword ? "direct" : requestedPasswordMode ?? "link";

      if (passwordMode === "link") {
        const reset = await createAndDispatchPasswordResetNotification(prisma, config, {
          user: target,
          ttlMinutes: config.resetTokenTtlMinutes
        });

        await audit({
          actorUserId: req.authUser?.id,
          targetUserId: target.id,
          action: "USER_PASSWORD_RESET_REQUESTED_BY_ADMIN",
          req,
          metadata: {
            notificationId: reset.notificationId,
            expiresAt: reset.expiresAt.toISOString(),
            deliveryStatus: reset.deliveryStatus,
            deliveryError: reset.deliveryError,
            passwordMode
          }
        });

        if (reset.deliveryStatus !== "SENT") {
          res.status(502).json({
            ok: false,
            message: reset.deliveryError || "Reset link could not be delivered."
          });
          return;
        }

        res.json({
          ok: true,
          resetLink: reset.resetLink
        });
        return;
      }

      let effectivePassword: string;
      let mustChangePassword = true;

      if (passwordMode === "manual") {
        if (!temporaryPasswordInput) {
          res.status(400).json({ ok: false, message: "temporaryPassword is required for manual resets." });
          return;
        }
        effectivePassword = temporaryPasswordInput;
      } else if (passwordMode === "auto") {
        effectivePassword = generateTemporaryPassword();
      } else {
        if (!newPassword.trim()) {
          res.status(400).json({ ok: false, message: "newPassword is required." });
          return;
        }

        if (hasOwn(req.body, "mustChangePassword")) {
          const requestedMustChangePassword = parseBoolean(req.body?.mustChangePassword);
          if (requestedMustChangePassword === null) {
            res.status(400).json({ ok: false, message: "Invalid mustChangePassword value." });
            return;
          }
          mustChangePassword = requestedMustChangePassword;
        }

        effectivePassword = newPassword;
      }

      const passwordValidation = validateManagedPassword(effectivePassword, {
        minLength: securitySettings.passwordMinLength,
        requireNumberOrSpecial: securitySettings.passwordRequireNumberOrSpecial
      });
      if (!passwordValidation.valid) {
        res.status(400).json({ ok: false, message: passwordValidation.message });
        return;
      }

      const now = new Date();
      const passwordHash = await hashPassword(effectivePassword);
      const [updated] = await prisma.$transaction([
        prisma.user.update({
          where: {
            id: target.id
          },
          include: {
            externalOrg: {
              select: {
                id: true,
                name: true
              }
            }
          },
          data: {
            passwordHash,
            passwordUpdatedAt: now,
            lastPasswordResetAt: now,
            mustChangePassword,
            failedLoginCount: 0,
            lockedUntil: null
          }
        }),
        prisma.session.updateMany({
          where: {
            userId: target.id,
            revokedAt: null
          },
          data: {
            revokedAt: now
          }
        }),
        prisma.passwordResetToken.updateMany({
          where: {
            userId: target.id,
            usedAt: null
          },
          data: {
            usedAt: now
          }
        })
      ]);

      await audit({
        actorUserId: req.authUser?.id,
        targetUserId: target.id,
        action: "USER_PASSWORD_RESET_BY_ADMIN",
        req,
        metadata: {
          passwordMode,
          mustChangePassword
        }
      });

      if (passwordMode === "direct") {
        res.json({
          ok: true,
          user: toSafeUser(updated)
        });
        return;
      }

      res.json({
        ok: true,
        temporaryPassword: passwordMode === "auto" ? effectivePassword : undefined
      });
    } catch (error) {
      next(error);
    }
  };

  router.post(
    "/admin/users/:id/reset-password",
    authMiddleware,
    requireAdminPermissions("users.manage"),
    handleAdminResetPassword
  );
  router.post("/admin/users/:id/reset", authMiddleware, requireAdminPermissions("users.manage"), handleAdminResetPassword);

  router.post(
    "/admin/users/:id/unlock",
    authMiddleware,
    requireAdminPermissions("users.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.params.id;

        const target = await prisma.user.findUnique({
          where: {
            id: userId
          }
        });

        if (!target) {
          res.status(404).json({ ok: false, message: "User not found." });
          return;
        }

        const updated = await prisma.user.update({
          where: {
            id: userId
          },
          data: {
            failedLoginCount: 0,
            lockedUntil: null
          }
        });

        await audit({
          actorUserId: req.authUser?.id,
          targetUserId: updated.id,
          action: "USER_UNLOCKED",
          req
        });

        res.json({
          ok: true,
          user: toSafeUser(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/users/:id/reset-mfa",
    authMiddleware,
    requireAdminPermissions("users.manage"),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.params.id;
        const target = await prisma.user.findUnique({
          where: {
            id: userId
          }
        });

        if (!target) {
          res.status(404).json({ ok: false, message: "User not found." });
          return;
        }

        const [updated] = await prisma.$transaction([
          prisma.user.update({
            where: {
              id: userId
            },
            data: {
              mfaEnabled: false,
              mfaEnforced: false,
              mfaTotpSecretEnc: null,
              mfaVerifiedAt: null,
              mfaRecoveryCodesHashJson: null
            }
          }),
          prisma.mfaPending.deleteMany({
            where: {
              userId
            }
          }),
          prisma.mfaChallenge.deleteMany({
            where: {
              userId
            }
          })
        ]);

        await audit({
          actorUserId: req.authUser?.id,
          targetUserId: userId,
          action: "MFA_DISABLED",
          req,
          metadata: {
            reason: "ADMIN_RESET"
          }
        });

        if (target.mfaEnforced) {
          await audit({
            actorUserId: req.authUser?.id,
            targetUserId: userId,
            action: "MFA_ENFORCED_CHANGED",
            req,
            metadata: {
              from: true,
              to: false,
              reason: "ADMIN_RESET"
            }
          });
        }

        res.json({
          ok: true,
          user: toSafeUser(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.use(config.basePath, router);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof Error && err.message === "Origin not allowed") {
      res.status(403).json({ ok: false, message: "Origin not allowed." });
      return;
    }

    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      typeof (err as { status?: unknown }).status === "number" &&
      (err as { status: number }).status === 413
    ) {
      res.status(413).json({ ok: false, message: "Payload too large." });
      return;
    }

    const message = config.nodeEnv === "development" && err instanceof Error ? err.message : "Unexpected error";
    res.status(500).json({
      ok: false,
      message
    });
  });

  return app;
}
