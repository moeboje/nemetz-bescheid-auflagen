import React from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppShell, Button, Card, IconButton, Sidebar, SidebarNavItem, Topbar } from "@nemetz/ui";
import { t } from "./i18n";
import TasksPage from "./pages/TasksPage";
import TaskDetailPage from "./pages/TaskDetailPage";
import LegalDocPage from "./pages/LegalDocPage";
import UiDemoPage from "./pages/UiDemoPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import LegalDocsPage from "./pages/LegalDocsPage";
import ScopesPage from "./pages/ScopesPage";
import DashboardPage from "./pages/DashboardPage";
import ObligationsPage from "./pages/ObligationsPage";
import ObligationDetailPage from "./pages/ObligationDetailPage";
import DeadlinesPage from "./pages/DeadlinesPage";
import DeadlineDetailPage from "./pages/DeadlineDetailPage";
import ComplianceSummaryPage from "./pages/ComplianceSummaryPage";
import NotificationsPage from "./pages/NotificationsPage";
import ReportsPage from "./pages/ReportsPage";
import TasksReportPrintPage from "./pages/TasksReportPrintPage";
import AboutPage from "./pages/AboutPage";
import HelpPage from "./pages/HelpPage";
import QuickGuidePage from "./pages/QuickGuidePage";
import RoadmapPage from "./pages/RoadmapPage";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminRolesPage from "./pages/AdminRolesPage";
import AdminExternalOrgsPage from "./pages/AdminExternalOrgsPage";
import AdminAuthoritiesPage from "./pages/AdminAuthoritiesPage";
import AdminProcedureMasterDataPage from "./pages/AdminProcedureMasterDataPage";
import AdminSecurityPage from "./pages/AdminSecurityPage";
import AdminNotificationsPage from "./pages/AdminNotificationsPage";
import AdminDesignPage from "./pages/AdminDesignPage";
import MfaVerifyPage from "./pages/MfaVerifyPage";
import AccountPage from "./pages/AccountPage";
import SecuritySettingsPage from "./pages/SecuritySettingsPage";
import {
  AdminIcon,
  BellIcon,
  DashboardIcon,
  DeadlinesIcon,
  LegalDocIcon,
  MenuIcon,
  ObligationIcon,
  ProjectsIcon,
  ScopesIcon,
  TasksIcon
} from "./components/Icons";
import { ScopesProvider } from "./state/ScopesStore";
import { ProjectsProvider } from "./state/ProjectsStore";
import { AuthoritiesProvider } from "./state/AuthoritiesStore";
import { UsersProvider, useUsers } from "./state/UsersStore";
import { LegalDocsProvider } from "./state/LegalDocsStore";
import { DocumentsProvider } from "./state/DocumentsStore";
import { ObligationsProvider } from "./state/ObligationsStore";
import { DeadlinesProvider } from "./state/DeadlinesStore";
import { TasksProvider } from "./state/TasksStore";
import { AuthorizationProvider, useAuthorization } from "./state/AuthorizationStore";
import { AuditLogProvider } from "./state/AuditLogStore";
import { TaskStateProvider } from "./state/TaskStateStore";
import { NotificationsProvider, useNotifications } from "./state/NotificationsStore";
import { loadFromStorage, saveToStorage } from "./state/storage";
import { useRuntimeConfig } from "./config/runtimeConfig";
import { isSafeModeActive, leaveSafeMode } from "./state/safeMode";
import { HelpHintsProvider } from "./state/HelpHintsStore";
import { getUserDisplayName } from "./data/users";
import { AuthProvider, useAuth } from "./state/AuthStore";
import { RolesProvider } from "./state/RolesStore";
import { ExternalOrgsProvider } from "./state/ExternalOrgsStore";
import { BrandingProvider, useBranding } from "./state/BrandingStore";
import { resolveBrandingAssetUrl } from "./api/branding";
import { ProcedureMasterDataProvider } from "./state/ProcedureMasterDataStore";

const MODULE_PREFIX = "compliance";
const MODULE_BASE_PATH = `/${MODULE_PREFIX}`;
const ADMIN_BASE_PATH = "/admin";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "nemetz.sidebarCollapsed";

function isPersonalSecurityRoute(pathname: string) {
  const normalizedPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return normalizedPath.endsWith("/account/security") || normalizedPath.endsWith("/settings/security");
}

function isAdminRoute(pathname: string) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (
    normalizedPath === ADMIN_BASE_PATH ||
    normalizedPath.startsWith(`${ADMIN_BASE_PATH}/`) ||
    normalizedPath === `${MODULE_BASE_PATH}/admin` ||
    normalizedPath.startsWith(`${MODULE_BASE_PATH}/admin/`)
  );
}

function isTasksReportPrintRoute(pathname: string) {
  const normalizedPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return normalizedPath === `${MODULE_BASE_PATH}/reports/tasks` || normalizedPath === "/reports/tasks";
}

function isQuickGuidePrintRoute(pathname: string) {
  const normalizedPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return normalizedPath === `${MODULE_BASE_PATH}/help/quick-guide` || normalizedPath === "/help/quick-guide";
}

function getRoleLabel(companyRole: string, isExternal: boolean) {
  const typeLabel = isExternal ? t("users.external") : t("users.internal");
  if (!companyRole.trim()) {
    return typeLabel;
  }
  return `${companyRole} · ${typeLabel}`;
}

function SidebarBranding({ collapsed }: { collapsed: boolean }) {
  const { branding } = useBranding();

  if (collapsed) {
    if (!branding.hasIcon || !branding.iconUrl) {
      return null;
    }

    return (
      <div className="sidebarBranding sidebarBrandingCollapsed">
        <img
          src={resolveBrandingAssetUrl(branding.iconUrl)}
          alt={t("branding.sidebarIconAlt")}
          className="sidebarBrandingIcon"
        />
      </div>
    );
  }

  if (!branding.hasLogo || !branding.logoUrl) {
    return null;
  }

  return (
    <div className="sidebarBranding sidebarBrandingExpanded">
      <img
        src={resolveBrandingAssetUrl(branding.logoUrl)}
        alt={t("branding.sidebarLogoAlt")}
        className="sidebarBrandingImage"
      />
    </div>
  );
}

function AuthLoadingScreen() {
  return (
    <div className="authPage">
      <Card>
        <p className="placeholderText">{t("auth.loading")}</p>
      </Card>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return <>{children}</>;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (user) {
    if (user.mustChangePassword) {
      return <Navigate to={`${MODULE_BASE_PATH}/account/security?mode=force-password-change`} replace />;
    }
    return <Navigate to={`${MODULE_BASE_PATH}/dashboard`} replace />;
  }

  return <>{children}</>;
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { currentUser } = useUsers();
  const { permissions } = useAuthorization();
  const { activeCount } = useNotifications();
  const runtimeConfig = useRuntimeConfig();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState<boolean>(() =>
    loadFromStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, false)
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [isMobileNavigation, setIsMobileNavigation] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 960px)").matches : false
  );
  const [isLogoutPending, setIsLogoutPending] = React.useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = React.useState(false);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);
  const safeMode = isSafeModeActive(location.search);
  const reportsEnabled = runtimeConfig.features.enableReports;
  const notificationsEnabled = runtimeConfig.features.enableNotifications;
  const canAccessReports = reportsEnabled && permissions.canViewReports && permissions.canViewTasks;
  const currentAccountUser = user ?? currentUser;
  const restrictedFallback = `${MODULE_BASE_PATH}/dashboard`;
  const accountPath = `${MODULE_BASE_PATH}/account`;
  const personalSecurityPath = `${MODULE_BASE_PATH}/account/security`;
  const defaultAdminPath = permissions.canViewUsersAdmin
    ? `${ADMIN_BASE_PATH}/users`
    : permissions.canViewRolesAdmin
    ? `${ADMIN_BASE_PATH}/roles`
    : permissions.canViewSecurityAdmin
    ? `${ADMIN_BASE_PATH}/security`
    : permissions.canViewDesignAdmin
    ? `${ADMIN_BASE_PATH}/design`
    : permissions.canViewProcedureMasterDataAdmin
    ? `${ADMIN_BASE_PATH}/procedure-master-data`
    : permissions.canViewExternalOrgsAdmin
    ? `${ADMIN_BASE_PATH}/external-orgs`
    : permissions.canViewAuthoritiesAdmin
    ? `${ADMIN_BASE_PATH}/authorities`
    : permissions.canViewNotificationsAdmin
    ? `${ADMIN_BASE_PATH}/notifications`
    : ADMIN_BASE_PATH;

  React.useEffect(() => {
    saveToStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed);
  }, [sidebarCollapsed]);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 960px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobileNavigation(event.matches);
    };

    setIsMobileNavigation(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  React.useEffect(() => {
    setMobileSidebarOpen(false);
    setIsAccountMenuOpen(false);
  }, [location.pathname, location.search]);

  React.useEffect(() => {
    if (!isMobileNavigation) {
      setMobileSidebarOpen(false);
    }
  }, [isMobileNavigation]);

  React.useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (accountMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsAccountMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isAccountMenuOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isAccountMenuOpen) {
        setIsAccountMenuOpen(false);
        return;
      }
      if (event.key === "Escape" && isMobileNavigation && mobileSidebarOpen) {
        setMobileSidebarOpen(false);
        return;
      }
      if (event.key === "Escape" && !isMobileNavigation && !sidebarCollapsed) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAccountMenuOpen, isMobileNavigation, mobileSidebarOpen, sidebarCollapsed]);

  const handleLogout = async () => {
    setIsLogoutPending(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setIsLogoutPending(false);
    }
  };

  const navItems = [
    {
      key: "dashboard",
      label: t("nav.dashboard"),
      path: `${MODULE_BASE_PATH}/dashboard`,
      icon: <DashboardIcon />,
      visible: true
    },
    {
      key: "projects",
      label: t("nav.projects"),
      path: `${MODULE_BASE_PATH}/projects`,
      icon: <ProjectsIcon />,
      visible: permissions.canViewProjects
    },
    {
      key: "legal",
      label: t("nav.legalDocs"),
      path: `${MODULE_BASE_PATH}/legal-docs`,
      icon: <LegalDocIcon />,
      visible: permissions.canViewLegalDocs
    },
    {
      key: "obligations",
      label: t("nav.obligations"),
      path: `${MODULE_BASE_PATH}/obligations`,
      icon: <ObligationIcon />,
      visible: permissions.canViewObligations
    },
    {
      key: "tasks",
      label: t("nav.tasks"),
      path: `${MODULE_BASE_PATH}/tasks`,
      icon: <TasksIcon />,
      visible: permissions.canViewTasks
    },
    {
      key: "deadlines",
      label: t("nav.deadlines"),
      path: `${MODULE_BASE_PATH}/deadlines`,
      icon: <DeadlinesIcon />,
      visible: permissions.canViewDeadlines
    },
    {
      key: "scopes",
      label: t("nav.scopes"),
      path: `${MODULE_BASE_PATH}/scopes`,
      icon: <ScopesIcon />,
      visible: permissions.canViewScopes
    },
    {
      key: "reports",
      label: t("nav.reports"),
      path: `${MODULE_BASE_PATH}/reports`,
      icon: <DashboardIcon />,
      visible: canAccessReports
    },
    {
      key: "notifications",
      label: t("nav.notifications"),
      path: `${MODULE_BASE_PATH}/notifications`,
      icon: <BellIcon />,
      visible: notificationsEnabled
    },
    {
      key: "about",
      label: t("nav.about"),
      path: `${MODULE_BASE_PATH}/about`,
      icon: <AdminIcon />,
      visible: true
    },
    {
      key: "admin",
      label: t("nav.admin"),
      path: defaultAdminPath,
      icon: <AdminIcon />,
      visible: permissions.canViewAdmin
    }
  ];

  if (user?.mustChangePassword && !isPersonalSecurityRoute(location.pathname)) {
    return <Navigate to={`${personalSecurityPath}?mode=force-password-change`} replace />;
  }

  if (isTasksReportPrintRoute(location.pathname)) {
    if (!canAccessReports) {
      return <Navigate to={restrictedFallback} replace />;
    }
    return <TasksReportPrintPage />;
  }

  if (isQuickGuidePrintRoute(location.pathname)) {
    return <QuickGuidePage />;
  }

  const sidebarNavCollapsed = isMobileNavigation ? false : sidebarCollapsed;
  const toggleSidebarLabel = isMobileNavigation
    ? mobileSidebarOpen
      ? t("nav.collapseSidebar")
      : t("nav.expandSidebar")
    : sidebarCollapsed
    ? t("nav.expandSidebar")
    : t("nav.collapseSidebar");
  const handleSidebarToggle = () => {
    if (isMobileNavigation) {
      setMobileSidebarOpen((value) => !value);
      return;
    }
    setSidebarCollapsed((value) => !value);
  };

  return (
    <AppShell
      sidebarCollapsed={sidebarNavCollapsed}
      mobileSidebarOpen={mobileSidebarOpen}
      onMobileSidebarClose={() => setMobileSidebarOpen(false)}
      mobileOverlayAriaLabel={t("nav.collapseSidebar")}
      sidebar={
        <Sidebar>
          <SidebarBranding collapsed={sidebarNavCollapsed} />
          {!sidebarNavCollapsed ? <div className="sidebarSectionTitle">{t("nav.module")}</div> : null}
          {navItems
            .filter((item) => item.visible)
            .map((item) => (
              <SidebarNavItem
                key={item.key}
                icon={item.icon}
                collapsed={sidebarNavCollapsed}
                tooltip={item.label}
                active={item.key === "admin" ? isAdminRoute(location.pathname) : location.pathname.startsWith(item.path)}
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </SidebarNavItem>
            ))}
        </Sidebar>
      }
      topbar={
        <Topbar
          left={
            <IconButton
              ariaLabel={toggleSidebarLabel}
              aria-expanded={isMobileNavigation ? mobileSidebarOpen : !sidebarCollapsed}
              onClick={handleSidebarToggle}
            >
              <MenuIcon />
            </IconButton>
          }
          right={
            <div className="topbarRight">
              <div className="topbarUserMenu" ref={accountMenuRef}>
                <button
                  type="button"
                  className={`topbarUserBadge topbarUserBadgeButton ${isAccountMenuOpen ? "topbarUserBadgeButtonOpen" : ""}`}
                  aria-haspopup="menu"
                  aria-expanded={isAccountMenuOpen}
                  aria-label={t("account.menu.label")}
                  onClick={() => setIsAccountMenuOpen((value) => !value)}
                >
                  <span className="topbarUserName">
                    {currentAccountUser ? getUserDisplayName(currentAccountUser) : t("topbar.userDemo")}
                  </span>
                  {currentAccountUser ? (
                    <span className="topbarUserRole">
                      {getRoleLabel(currentAccountUser.companyRole, currentAccountUser.isExternal)}
                    </span>
                  ) : null}
                </button>

                {isAccountMenuOpen ? (
                  <div className="topbarUserMenuPopover" role="menu" aria-label={t("account.menu.label")}>
                    <button
                      type="button"
                      role="menuitem"
                      className="topbarMenuItem"
                      onClick={() => navigate(accountPath)}
                    >
                      {t("account.menu.overview")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="topbarMenuItem"
                      onClick={() => navigate(personalSecurityPath)}
                    >
                      {t("account.menu.security")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="topbarMenuItem topbarMenuItemDanger"
                      onClick={() => void handleLogout()}
                      disabled={isLogoutPending}
                    >
                      {isLogoutPending ? t("auth.logout.pending") : t("auth.logout")}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="topbarActionGroup">
                {notificationsEnabled ? (
                  <IconButton
                    ariaLabel={t("topbar.notifications")}
                    onClick={() => navigate(`${MODULE_BASE_PATH}/notifications`)}
                  >
                    <div className="topbarBellWrapper">
                      <BellIcon />
                      {activeCount > 0 ? (
                        <span className="topbarBellBadge">{activeCount > 99 ? "99+" : activeCount}</span>
                      ) : null}
                    </div>
                  </IconButton>
                ) : null}
                <IconButton ariaLabel={t("help.open")} onClick={() => navigate(`${MODULE_BASE_PATH}/help`)}>
                  <span className="topbarHelpGlyph">?</span>
                </IconButton>
              </div>
            </div>
          }
        />
      }
    >
      {safeMode ? (
        <div className="safeModeBanner">
          <span>{t("safeMode.banner")}</span>
          <Button size="sm" variant="ghost" onClick={() => leaveSafeMode()}>
            {t("safeMode.leave")}
          </Button>
        </div>
      ) : null}
      <Routes>
        <Route path="/" element={<Navigate to={`${MODULE_BASE_PATH}/dashboard`} replace />} />
        <Route path={MODULE_PREFIX}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route
            path="projects"
            element={permissions.canViewProjects ? <ProjectsPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="projects/:id"
            element={permissions.canViewProjects ? <ProjectDetailPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="legal-docs"
            element={permissions.canViewLegalDocs ? <LegalDocsPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="legal-docs/:id"
            element={permissions.canViewLegalDocs ? <LegalDocPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="obligations"
            element={permissions.canViewObligations ? <ObligationsPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="obligations/:id"
            element={permissions.canViewObligations ? <ObligationDetailPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="tasks"
            element={permissions.canViewTasks ? <TasksPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="tasks/:id"
            element={permissions.canViewTasks ? <TaskDetailPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="deadlines"
            element={permissions.canViewDeadlines ? <DeadlinesPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="deadlines/:id"
            element={permissions.canViewDeadlines ? <DeadlineDetailPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="scopes"
            element={permissions.canViewScopes ? <ScopesPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin"
            element={
              permissions.canViewAdmin ? (
                <Navigate to={defaultAdminPath} replace />
              ) : (
                <Navigate to={restrictedFallback} replace />
              )
            }
          />
          <Route
            path="admin/users"
            element={permissions.canViewUsersAdmin ? <Navigate to={`${ADMIN_BASE_PATH}/users`} replace /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/roles"
            element={permissions.canViewRolesAdmin ? <Navigate to={`${ADMIN_BASE_PATH}/roles`} replace /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/external-orgs"
            element={permissions.canViewExternalOrgsAdmin ? <Navigate to={`${ADMIN_BASE_PATH}/external-orgs`} replace /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/authorities"
            element={permissions.canViewAuthoritiesAdmin ? <Navigate to={`${ADMIN_BASE_PATH}/authorities`} replace /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/procedure-master-data"
            element={permissions.canViewProcedureMasterDataAdmin ? <Navigate to={`${ADMIN_BASE_PATH}/procedure-master-data`} replace /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/security"
            element={permissions.canViewSecurityAdmin ? <Navigate to={`${ADMIN_BASE_PATH}/security`} replace /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/design"
            element={permissions.canViewDesignAdmin ? <Navigate to={`${ADMIN_BASE_PATH}/design`} replace /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/notifications"
            element={permissions.canViewNotificationsAdmin ? <Navigate to={`${ADMIN_BASE_PATH}/notifications`} replace /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route path="account" element={<AccountPage />} />
          <Route path="account/security" element={<SecuritySettingsPage />} />
          <Route path="compliance-summary" element={<ComplianceSummaryPage />} />
          <Route
            path="reports"
            element={canAccessReports ? <ReportsPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="notifications"
            element={notificationsEnabled ? <NotificationsPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route path="about" element={<AboutPage />} />
          <Route path="help/quick-guide" element={<QuickGuidePage />} />
          <Route path="help/roadmap" element={<RoadmapPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="settings/security" element={<Navigate to={personalSecurityPath} replace />} />
        </Route>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/ui-demo" element={<UiDemoPage />} />
        <Route
          path="/projects"
          element={permissions.canViewProjects ? <ProjectsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/projects/:id"
          element={permissions.canViewProjects ? <ProjectDetailPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/legal-docs"
          element={permissions.canViewLegalDocs ? <LegalDocsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/legal-docs/:id"
          element={permissions.canViewLegalDocs ? <LegalDocPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/obligations"
          element={permissions.canViewObligations ? <ObligationsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/obligations/:id"
          element={permissions.canViewObligations ? <ObligationDetailPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/tasks"
          element={permissions.canViewTasks ? <TasksPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/tasks/:id"
          element={permissions.canViewTasks ? <TaskDetailPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/deadlines"
          element={permissions.canViewDeadlines ? <DeadlinesPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/deadlines/:id"
          element={permissions.canViewDeadlines ? <DeadlineDetailPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/scopes"
          element={permissions.canViewScopes ? <ScopesPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin"
          element={
            permissions.canViewAdmin ? (
              <Navigate to={defaultAdminPath} replace />
            ) : (
              <Navigate to={restrictedFallback} replace />
            )
          }
        />
        <Route
          path="/admin/users"
          element={permissions.canViewUsersAdmin ? <AdminUsersPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/roles"
          element={permissions.canViewRolesAdmin ? <AdminRolesPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/external-orgs"
          element={permissions.canViewExternalOrgsAdmin ? <AdminExternalOrgsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/authorities"
          element={permissions.canViewAuthoritiesAdmin ? <AdminAuthoritiesPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/procedure-master-data"
          element={permissions.canViewProcedureMasterDataAdmin ? <AdminProcedureMasterDataPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/security"
          element={permissions.canViewSecurityAdmin ? <AdminSecurityPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/design"
          element={permissions.canViewDesignAdmin ? <AdminDesignPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/notifications"
          element={permissions.canViewNotificationsAdmin ? <AdminNotificationsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/security" element={<SecuritySettingsPage />} />
        <Route path="/compliance-summary" element={<ComplianceSummaryPage />} />
        <Route
          path="/reports"
          element={canAccessReports ? <ReportsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/notifications"
          element={notificationsEnabled ? <NotificationsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/help/quick-guide" element={<QuickGuidePage />} />
        <Route path="/help/roadmap" element={<RoadmapPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/settings/security" element={<Navigate to={personalSecurityPath} replace />} />
        <Route path="*" element={<Navigate to={`${MODULE_BASE_PATH}/dashboard`} replace />} />
      </Routes>
    </AppShell>
  );
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/help/auth" element={<HelpPage scope="publicAuth" standalone />} />
      <Route
        path="/login"
        element={
          <RequireGuest>
            <LoginPage />
          </RequireGuest>
        }
      />
      <Route
        path="/mfa"
        element={
          <RequireGuest>
            <MfaVerifyPage />
          </RequireGuest>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <RequireGuest>
            <ForgotPasswordPage />
          </RequireGuest>
        }
      />
      <Route
        path="/reset-password"
        element={
          <RequireGuest>
            <ResetPasswordPage />
          </RequireGuest>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ScopesProvider>
        <AuthoritiesProvider>
          <RolesProvider>
            <ExternalOrgsProvider>
              <UsersProvider>
                <HelpHintsProvider>
                  <AuthorizationProvider>
                    <BrandingProvider>
                      <AuditLogProvider>
                        <ProcedureMasterDataProvider>
                          <ProjectsProvider>
                            <DocumentsProvider>
                              <LegalDocsProvider>
                                <ObligationsProvider>
                                  <DeadlinesProvider>
                                    <TaskStateProvider>
                                      <TasksProvider>
                                        <NotificationsProvider>
                                          <AppRouter />
                                        </NotificationsProvider>
                                      </TasksProvider>
                                    </TaskStateProvider>
                                  </DeadlinesProvider>
                                </ObligationsProvider>
                              </LegalDocsProvider>
                            </DocumentsProvider>
                          </ProjectsProvider>
                        </ProcedureMasterDataProvider>
                      </AuditLogProvider>
                    </BrandingProvider>
                  </AuthorizationProvider>
                </HelpHintsProvider>
              </UsersProvider>
            </ExternalOrgsProvider>
          </RolesProvider>
        </AuthoritiesProvider>
      </ScopesProvider>
    </AuthProvider>
  );
}
