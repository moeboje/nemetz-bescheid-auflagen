const ADMIN_BASE_PATH = "/admin";
const MODULE_ADMIN_BASE_PATH = "/compliance/admin";

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

export function shouldAutoLoadDomainStore(pathname: string) {
  return !isAdminRoutePath(pathname);
}
