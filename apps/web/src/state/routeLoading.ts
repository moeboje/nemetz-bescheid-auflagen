const ADMIN_BASE_PATH = "/admin";
const MODULE_ADMIN_BASE_PATH = "/compliance/admin";
const PROJECTS_BASE_PATH = "/projects";
const MODULE_PROJECTS_BASE_PATH = "/compliance/projects";

export type DomainStoreKey =
  | "authorities"
  | "deadlines"
  | "legalDocs"
  | "obligations"
  | "procedureMasterData"
  | "projects"
  | "scopes"
  | "taskState"
  | "users";

const PROJECT_DETAIL_ALLOWED_AUTO_LOAD_STORES = new Set<DomainStoreKey>([
  "authorities",
  "scopes",
  "users"
]);

function normalizePath(pathname: string) {
  const trimmed = pathname.trim() || "/";
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

export function isAdminRoutePath(pathname: string) {
  const normalized = normalizePath(pathname);
  return (
    normalized === ADMIN_BASE_PATH ||
    normalized.startsWith(`${ADMIN_BASE_PATH}/`) ||
    normalized === MODULE_ADMIN_BASE_PATH ||
    normalized.startsWith(`${MODULE_ADMIN_BASE_PATH}/`)
  );
}

export function isLegacyAdminRootPath(pathname: string) {
  const normalized = normalizePath(pathname);
  return normalized === ADMIN_BASE_PATH || normalized === MODULE_ADMIN_BASE_PATH;
}

export function isProjectDetailRoutePath(pathname: string) {
  const normalized = normalizePath(pathname);
  return (
    normalized.startsWith(`${PROJECTS_BASE_PATH}/`) ||
    normalized.startsWith(`${MODULE_PROJECTS_BASE_PATH}/`)
  );
}

export function shouldAutoLoadDomainStore(pathname: string, store?: DomainStoreKey) {
  if (isAdminRoutePath(pathname)) {
    return false;
  }

  if (!isProjectDetailRoutePath(pathname)) {
    return true;
  }

  return Boolean(store && PROJECT_DETAIL_ALLOWED_AUTO_LOAD_STORES.has(store));
}
