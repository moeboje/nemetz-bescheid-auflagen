export const PERMISSION_KEYS = [
  "admin.access",
  "dashboard.view",
  "masterData.view",
  "masterData.manage",
  "projects.view",
  "projects.create",
  "projects.edit",
  "projects.archive",
  "projects.export",
  "legalDocs.view",
  "legalDocs.create",
  "legalDocs.edit",
  "legalDocs.archive",
  "legalDocs.export",
  "obligations.view",
  "obligations.create",
  "obligations.edit",
  "obligations.archive",
  "obligations.export",
  "deadlines.view",
  "deadlines.create",
  "deadlines.edit",
  "deadlines.archive",
  "deadlines.export",
  "tasks.view",
  "tasks.edit",
  "tasks.complete",
  "reports.view",
  "reports.export",
  "authorities.view",
  "authorities.manage",
  "externalOrgs.view",
  "externalOrgs.manage",
  "users.view",
  "users.manage",
  "roles.view",
  "roles.manage",
  "security.view",
  "security.manage",
  "notifications.view",
  "notifications.retry",
  "notifications.settings.manage"
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type RoleCatalogEntry = {
  key: string;
  labelDe: string;
  descriptionDe: string;
  isSystem: boolean;
  isAssignable: boolean;
  isDeprecated?: boolean;
  permissionKeys: PermissionKey[];
};

export type PermissionCatalogEntry = {
  key: PermissionKey;
  label: string;
  group: string;
  requiresAdminAccess: boolean;
};

const permissionKeySet = new Set<string>(PERMISSION_KEYS);
const hiddenRoleEditorPermissionKeys = new Set<PermissionKey>();
const adminSubsectionPermissionKeys = new Set<PermissionKey>([
  "authorities.manage",
  "externalOrgs.view",
  "externalOrgs.manage",
  "users.view",
  "users.manage",
  "roles.view",
  "roles.manage",
  "security.view",
  "security.manage",
  "notifications.view",
  "notifications.retry",
  "notifications.settings.manage"
]);

const internalReadPermissions: PermissionKey[] = [
  "dashboard.view",
  "masterData.view",
  "projects.view",
  "projects.export",
  "legalDocs.view",
  "legalDocs.export",
  "obligations.view",
  "obligations.export",
  "deadlines.view",
  "deadlines.export",
  "tasks.view",
  "reports.view",
  "reports.export",
  "authorities.view"
];

const editorPermissions: PermissionKey[] = [
  ...internalReadPermissions,
  "projects.create",
  "projects.edit",
  "legalDocs.create",
  "legalDocs.edit",
  "obligations.create",
  "obligations.edit",
  "deadlines.create",
  "deadlines.edit",
  "tasks.edit",
  "tasks.complete"
];

const managerPermissions: PermissionKey[] = [
  ...editorPermissions,
  "projects.archive",
  "legalDocs.archive",
  "obligations.archive",
  "deadlines.archive",
  "authorities.manage"
];

const legacyInternalPermissions: PermissionKey[] = [
  ...managerPermissions,
  "masterData.manage"
];

const adminPermissions: PermissionKey[] = [...PERMISSION_KEYS];

const externalPermissions: PermissionKey[] = ["dashboard.view"];

const documentOwnerPermissions = {
  PROJECT: {
    read: "projects.view",
    write: "projects.edit"
  },
  LEGAL_DOC: {
    read: "legalDocs.view",
    write: "legalDocs.edit"
  },
  OBLIGATION: {
    read: "obligations.view",
    write: "obligations.edit"
  },
  DEADLINE: {
    read: "deadlines.view",
    write: "deadlines.edit"
  },
  TASK_EVIDENCE: {
    read: "tasks.view",
    write: "tasks.edit"
  }
} as const satisfies Record<string, { read: PermissionKey; write: PermissionKey }>;

export const ROLE_CATALOG: RoleCatalogEntry[] = [
  {
    key: "ADMIN",
    labelDe: "Admin",
    descriptionDe: "Vollzugriff auf Portal, Administration und globale Sicherheit.",
    isSystem: true,
    isAssignable: true,
    permissionKeys: adminPermissions
  },
  {
    key: "COMPLIANCE_MANAGER",
    labelDe: "Compliance Manager",
    descriptionDe: "Operative Pflege in den Compliance-Domaenen inkl. Archivierung, aber ohne Admin- und globale Sicherheitsfunktionen.",
    isSystem: true,
    isAssignable: true,
    permissionKeys: managerPermissions
  },
  {
    key: "COMPLIANCE_EDITOR",
    labelDe: "Compliance Editor",
    descriptionDe: "Operative Pflege ohne Archivierung oder destruktive Admin-Funktionen.",
    isSystem: true,
    isAssignable: true,
    permissionKeys: editorPermissions
  },
  {
    key: "READ_ONLY",
    labelDe: "Read Only",
    descriptionDe: "Nur Lesen und freigegebene Exporte, keine fachlichen Aenderungen.",
    isSystem: true,
    isAssignable: true,
    permissionKeys: internalReadPermissions
  },
  {
    key: "EXTERNAL",
    labelDe: "Extern",
    descriptionDe: "Eingeschraenkter Zugriff fuer externe Benutzer.",
    isSystem: true,
    isAssignable: true,
    permissionKeys: externalPermissions
  },
  {
    key: "COMPLIANCE",
    labelDe: "Compliance (Legacy)",
    descriptionDe: "Legacy-Rolle mit demselben Berechtigungsbuendel wie Compliance Manager.",
    isSystem: true,
    isAssignable: false,
    isDeprecated: true,
    permissionKeys: managerPermissions
  },
  {
    key: "USER",
    labelDe: "Benutzer (Legacy)",
    descriptionDe: "Legacy-Rolle mit demselben Berechtigungsbuendel wie Compliance Editor.",
    isSystem: true,
    isAssignable: false,
    isDeprecated: true,
    permissionKeys: editorPermissions
  }
];

const roleCatalogByKey = new Map(
  ROLE_CATALOG.map((entry) => [entry.key, entry] as const)
);

export function normalizeRoleKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function getRoleCatalogEntry(roleKey: string | null | undefined) {
  return roleCatalogByKey.get(normalizeRoleKey(roleKey));
}

export function getAssignableRoleCatalog() {
  return ROLE_CATALOG.filter((entry) => entry.isAssignable);
}

export function getDefaultPermissionKeys(
  roleKey: string | null | undefined,
  userType: string | null | undefined,
  options: {
    useLegacyInternalFallback?: boolean;
  } = {}
) {
  if (String(userType ?? "").trim().toUpperCase() === "EXTERNAL") {
    return normalizeRolePermissionKeys([...externalPermissions]);
  }

  const entry = getRoleCatalogEntry(roleKey);
  if (entry) {
    return normalizeRolePermissionKeys([...entry.permissionKeys]);
  }

  if (options.useLegacyInternalFallback) {
    return normalizeRolePermissionKeys([...legacyInternalPermissions]);
  }

  return normalizeRolePermissionKeys([...editorPermissions]);
}

export function parsePermissionKeys(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as PermissionKey[];
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry): entry is PermissionKey => permissionKeySet.has(entry));

  return Array.from(new Set(normalized));
}

export function resolvePermissionKeys(args: {
  roleKey: string | null | undefined;
  userType: string | null | undefined;
  storedPermissionKeys?: unknown;
  hasStoredPermissionKeys?: boolean;
  useLegacyInternalFallback?: boolean;
}) {
  if (String(args.userType ?? "").trim().toUpperCase() === "EXTERNAL") {
    return getDefaultPermissionKeys(args.roleKey, args.userType);
  }

  const hasStoredPermissionKeys = args.hasStoredPermissionKeys ?? args.storedPermissionKeys !== undefined;
  if (hasStoredPermissionKeys) {
    return normalizeRolePermissionKeys(parsePermissionKeys(args.storedPermissionKeys));
  }
  return getDefaultPermissionKeys(args.roleKey, args.userType, {
    useLegacyInternalFallback: args.useLegacyInternalFallback
  });
}

function normalizeDocumentOwnerType(ownerType: string | null | undefined) {
  return String(ownerType ?? "").trim().toUpperCase();
}

export function getDocumentOwnerReadPermission(ownerType: string | null | undefined): PermissionKey | null {
  const entry = documentOwnerPermissions[normalizeDocumentOwnerType(ownerType) as keyof typeof documentOwnerPermissions];
  return entry?.read ?? null;
}

export function getDocumentOwnerWritePermission(ownerType: string | null | undefined): PermissionKey | null {
  const entry = documentOwnerPermissions[normalizeDocumentOwnerType(ownerType) as keyof typeof documentOwnerPermissions];
  return entry?.write ?? null;
}

export function hasPermission(permissionKeys: Iterable<string>, key: PermissionKey) {
  const normalized = new Set(permissionKeys);
  if (normalized.has(key)) {
    return true;
  }

  if (key === "masterData.view" && normalized.has("masterData.manage")) {
    return true;
  }

  if (key === "authorities.view" && normalized.has("authorities.manage")) {
    return true;
  }

  if (key === "externalOrgs.view" && normalized.has("externalOrgs.manage")) {
    return true;
  }

  if (
    key === "notifications.view" &&
    (normalized.has("notifications.retry") || normalized.has("notifications.settings.manage"))
  ) {
    return true;
  }

  return false;
}

export function normalizeRolePermissionKeys(permissionKeys: PermissionKey[]) {
  const normalized = new Set(permissionKeys);

  if (normalized.has("masterData.manage")) {
    normalized.add("masterData.view");
  }

  if (normalized.has("authorities.manage")) {
    normalized.add("authorities.view");
  }

  if (normalized.has("externalOrgs.manage")) {
    normalized.add("externalOrgs.view");
  }

  if (normalized.has("notifications.retry") || normalized.has("notifications.settings.manage")) {
    normalized.add("notifications.view");
  }

  return PERMISSION_KEYS.filter((permissionKey) => normalized.has(permissionKey));
}

export function canUseUserLookup(permissionKeys: Iterable<string>, userType: string | null | undefined) {
  if (String(userType ?? "").trim().toUpperCase() === "EXTERNAL") {
    return false;
  }

  return (
    hasPermission(permissionKeys, "users.view") ||
    hasPermission(permissionKeys, "users.manage") ||
    hasPermission(permissionKeys, "projects.create") ||
    hasPermission(permissionKeys, "projects.edit") ||
    hasPermission(permissionKeys, "obligations.create") ||
    hasPermission(permissionKeys, "obligations.edit") ||
    hasPermission(permissionKeys, "deadlines.create") ||
    hasPermission(permissionKeys, "deadlines.edit") ||
    hasPermission(permissionKeys, "tasks.edit") ||
    hasPermission(permissionKeys, "tasks.complete")
  );
}

export function permissionRequiresAdminAccess(permissionKey: PermissionKey) {
  return adminSubsectionPermissionKeys.has(permissionKey);
}

export function rolePermissionsRequireAdminAccess(permissionKeys: PermissionKey[]) {
  return permissionKeys.some((permissionKey) => permissionRequiresAdminAccess(permissionKey));
}

export function describePermission(permissionKey: PermissionKey) {
  switch (permissionKey) {
    case "admin.access":
      return "Admin-Bereich";
    case "dashboard.view":
      return "Dashboard ansehen";
    case "masterData.view":
      return "Stammdaten ansehen";
    case "masterData.manage":
      return "Stammdaten bearbeiten";
    case "projects.view":
      return "Projekte ansehen";
    case "projects.create":
      return "Projekte anlegen";
    case "projects.edit":
      return "Projekte bearbeiten";
    case "projects.archive":
      return "Projekte archivieren";
    case "projects.export":
      return "Projekte exportieren";
    case "legalDocs.view":
      return "Rechtsdokumente ansehen";
    case "legalDocs.create":
      return "Rechtsdokumente anlegen";
    case "legalDocs.edit":
      return "Rechtsdokumente bearbeiten";
    case "legalDocs.archive":
      return "Rechtsdokumente archivieren";
    case "legalDocs.export":
      return "Rechtsdokumente exportieren";
    case "obligations.view":
      return "Auflagen ansehen";
    case "obligations.create":
      return "Auflagen anlegen";
    case "obligations.edit":
      return "Auflagen bearbeiten";
    case "obligations.archive":
      return "Auflagen archivieren";
    case "obligations.export":
      return "Auflagen exportieren";
    case "deadlines.view":
      return "Fristen ansehen";
    case "deadlines.create":
      return "Fristen anlegen";
    case "deadlines.edit":
      return "Fristen bearbeiten";
    case "deadlines.archive":
      return "Fristen archivieren";
    case "deadlines.export":
      return "Fristen exportieren";
    case "tasks.view":
      return "Aufgaben ansehen";
    case "tasks.edit":
      return "Aufgaben bearbeiten";
    case "tasks.complete":
      return "Aufgaben abschliessen";
    case "reports.view":
      return "Reports ansehen";
    case "reports.export":
      return "Reports exportieren";
    case "authorities.view":
      return "Behoerden ansehen";
    case "authorities.manage":
      return "Behoerden bearbeiten";
    case "externalOrgs.view":
      return "Externe Organisationen ansehen";
    case "externalOrgs.manage":
      return "Externe Organisationen bearbeiten";
    case "users.view":
      return "Benutzerverwaltung ansehen";
    case "users.manage":
      return "Benutzer verwalten";
    case "roles.view":
      return "Rollenverwaltung ansehen";
    case "roles.manage":
      return "Rollen verwalten";
    case "security.view":
      return "Sicherheit ansehen";
    case "security.manage":
      return "Sicherheit verwalten";
    case "notifications.view":
      return "Benachrichtigungen ansehen";
    case "notifications.retry":
      return "Benachrichtigungen erneut senden / abbrechen";
    case "notifications.settings.manage":
      return "Benachrichtigungseinstellungen verwalten";
    default:
      return permissionKey;
  }
}

function getPermissionGroup(permissionKey: PermissionKey) {
  if (
    permissionKey === "admin.access" ||
    permissionKey.startsWith("users.") ||
    permissionKey.startsWith("roles.") ||
    permissionKey.startsWith("security.") ||
    permissionKey.startsWith("notifications.")
  ) {
    return "Administration";
  }
  if (permissionKey.startsWith("dashboard.") || permissionKey.startsWith("reports.")) {
    return "Dashboard & Reports";
  }
  if (
    permissionKey.startsWith("masterData.") ||
    permissionKey.startsWith("authorities.") ||
    permissionKey.startsWith("externalOrgs.")
  ) {
    return "Stammdaten";
  }
  if (permissionKey.startsWith("projects.")) {
    return "Projekte";
  }
  if (permissionKey.startsWith("legalDocs.")) {
    return "Rechtsdokumente";
  }
  if (permissionKey.startsWith("obligations.")) {
    return "Auflagen";
  }
  if (permissionKey.startsWith("deadlines.")) {
    return "Fristen";
  }
  if (permissionKey.startsWith("tasks.")) {
    return "Aufgaben";
  }
  return "Weitere";
}

export function getPermissionCatalog(): PermissionCatalogEntry[] {
  return PERMISSION_KEYS.map((key) => ({
    key,
    label: describePermission(key),
    group: getPermissionGroup(key),
    requiresAdminAccess: permissionRequiresAdminAccess(key)
  }));
}

export function getEditablePermissionCatalog(): PermissionCatalogEntry[] {
  return getPermissionCatalog().filter((entry) => !hiddenRoleEditorPermissionKeys.has(entry.key));
}

export function getEditableRolePermissionKeys(permissionKeys: PermissionKey[]) {
  return permissionKeys.filter((permissionKey) => !hiddenRoleEditorPermissionKeys.has(permissionKey));
}

export function getHiddenRoleEditorPermissionKeys(permissionKeys: PermissionKey[]) {
  return permissionKeys.filter((permissionKey) => hiddenRoleEditorPermissionKeys.has(permissionKey));
}

export function mergeEditableRolePermissionKeys(args: {
  existingPermissionKeys: PermissionKey[];
  requestedPermissionKeys: PermissionKey[];
}) {
  const preservedHiddenPermissionKeys = getHiddenRoleEditorPermissionKeys(args.existingPermissionKeys);
  const editablePermissionKeys = getEditableRolePermissionKeys(args.requestedPermissionKeys);
  return normalizeRolePermissionKeys([...preservedHiddenPermissionKeys, ...editablePermissionKeys]);
}

export function mapRequestToPermission(input: { method: string; path: string }) {
  const method = input.method.toUpperCase();
  const path = input.path.toLowerCase();
  const isRead = method === "GET" || method === "HEAD";
  const isArchiveAction =
    path.includes("/archive") ||
    path.includes("/restore") ||
    path.includes("/reactivate") ||
    path.includes("/reopen");

  if (path.startsWith("/projects") || path.startsWith("/project-checklists")) {
    if (isRead) {
      return "projects.view" as PermissionKey;
    }
    if (isArchiveAction) {
      return "projects.archive" as PermissionKey;
    }
    return method === "POST" ? ("projects.create" as PermissionKey) : ("projects.edit" as PermissionKey);
  }

  if (path.startsWith("/legal-docs")) {
    if (isRead) {
      return "legalDocs.view" as PermissionKey;
    }
    if (isArchiveAction) {
      return "legalDocs.archive" as PermissionKey;
    }
    return method === "POST" ? ("legalDocs.create" as PermissionKey) : ("legalDocs.edit" as PermissionKey);
  }

  if (path.startsWith("/obligations")) {
    if (isRead) {
      return "obligations.view" as PermissionKey;
    }
    if (isArchiveAction) {
      return "obligations.archive" as PermissionKey;
    }
    return method === "POST" ? ("obligations.create" as PermissionKey) : ("obligations.edit" as PermissionKey);
  }

  if (path.startsWith("/deadlines")) {
    if (isRead) {
      return "deadlines.view" as PermissionKey;
    }
    if (isArchiveAction) {
      return "deadlines.archive" as PermissionKey;
    }
    return method === "POST" ? ("deadlines.create" as PermissionKey) : ("deadlines.edit" as PermissionKey);
  }

  if (path.startsWith("/task-state")) {
    if (isRead) {
      return "tasks.view" as PermissionKey;
    }
    if (path.includes("/complete") || path.includes("/status")) {
      return "tasks.complete" as PermissionKey;
    }
    return "tasks.edit" as PermissionKey;
  }

  if (path.startsWith("/scopes")) {
    return isRead ? ("masterData.view" as PermissionKey) : ("masterData.manage" as PermissionKey);
  }

  if (path.startsWith("/authorities")) {
    return isRead ? ("authorities.view" as PermissionKey) : ("authorities.manage" as PermissionKey);
  }

  return null;
}
