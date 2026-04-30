export const BASE_DOCUMENT_TITLE = "Rechtsmanagement - Nemetz AG";

const COMPLIANCE_PREFIX = "/compliance";
const TASKS_REPORT_PRINT_PATH = "/reports/tasks";

const exactPageTitles = new Map<string, string>([
  ["/", "Dashboard"],
  ["/dashboard", "Dashboard"],
  ["/tasks", "Aufgaben"],
  ["/projects", "Projekte"],
  ["/legal-docs", "Rechtsdokumente"],
  ["/obligations", "Auflagen"],
  ["/deadlines", "Fristen"],
  ["/reports", "Berichte"],
  ["/compliance-summary", "Compliance Summary"],
  ["/notifications", "Benachrichtigungen"],
  ["/scopes", "Standorte/Scope"],
  ["/admin", "Admin"],
  ["/admin/users", "Benutzerverwaltung"],
  ["/admin/roles", "Rollenverwaltung"],
  ["/admin/external-orgs", "Externe Firmen"],
  ["/admin/authorities", "Behörden"],
  ["/admin/security", "Sicherheit"],
  ["/admin/notifications", "Benachrichtigungen"],
  ["/account", "Mein Konto"],
  ["/account/security", "Kontosicherheit"],
  ["/settings/security", "Kontosicherheit"],
  ["/login", "Anmeldung"],
  ["/mfa", "MFA bestätigen"],
  ["/forgot-password", "Passwort zurücksetzen"],
  ["/reset-password", "Passwort zurücksetzen"],
  ["/help", "Help Center"],
  ["/help/auth", "Hilfe zu Login & MFA"],
  ["/about", "Systeminformationen"],
  ["/ui-demo", "UI Demo"]
]);

const detailPageTitles: Array<{ prefix: string; title: string }> = [
  { prefix: "/admin/notifications", title: "Benachrichtigungen" },
  { prefix: "/admin/external-orgs", title: "Externe Firmen" },
  { prefix: "/admin/authorities", title: "Behörden" },
  { prefix: "/admin/security", title: "Sicherheit" },
  { prefix: "/admin/roles", title: "Rollenverwaltung" },
  { prefix: "/admin/users", title: "Benutzerverwaltung" },
  { prefix: "/legal-docs", title: "Rechtsdokumente" },
  { prefix: "/obligations", title: "Auflagen" },
  { prefix: "/deadlines", title: "Fristen" },
  { prefix: "/projects", title: "Projekte" },
  { prefix: "/tasks", title: "Aufgaben" }
];

export function formatDocumentTitle(pageTitle?: string) {
  const normalizedPageTitle = pageTitle?.trim();

  if (!normalizedPageTitle || normalizedPageTitle === BASE_DOCUMENT_TITLE) {
    return BASE_DOCUMENT_TITLE;
  }

  if (normalizedPageTitle.endsWith(` - ${BASE_DOCUMENT_TITLE}`)) {
    return normalizedPageTitle;
  }

  return `${normalizedPageTitle} - ${BASE_DOCUMENT_TITLE}`;
}

export function normalizeDocumentTitlePathname(pathname: string) {
  const withoutTrailingSlash = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (withoutTrailingSlash === COMPLIANCE_PREFIX) {
    return "/";
  }

  if (withoutTrailingSlash.startsWith(`${COMPLIANCE_PREFIX}/`)) {
    return withoutTrailingSlash.slice(COMPLIANCE_PREFIX.length) || "/";
  }

  return withoutTrailingSlash || "/";
}

export function shouldManageDocumentTitle(pathname: string) {
  return normalizeDocumentTitlePathname(pathname) !== TASKS_REPORT_PRINT_PATH;
}

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getDocumentTitleForPathname(pathname: string) {
  const normalizedPathname = normalizeDocumentTitlePathname(pathname);
  const exactTitle = exactPageTitles.get(normalizedPathname);

  if (exactTitle) {
    return formatDocumentTitle(exactTitle);
  }

  const detailTitle = detailPageTitles.find((entry) => matchesPathPrefix(normalizedPathname, entry.prefix));
  return formatDocumentTitle(detailTitle?.title);
}
