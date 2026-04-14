import React from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppShell, Button, Card, IconButton, Sidebar, SidebarNavItem, Topbar } from "@nemetz/ui";
import { t } from "./i18n";
import TasksPage from "./pages/TasksPage";
import { ServerStateSync } from "./components/ServerStateSync";
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
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminRolesPage from "./pages/AdminRolesPage";
import AdminExternalOrgsPage from "./pages/AdminExternalOrgsPage";
import MfaVerifyPage from "./pages/MfaVerifyPage";
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

const MODULE_PREFIX = "compliance";
const MODULE_BASE_PATH = `/${MODULE_PREFIX}`;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "nemetz.sidebarCollapsed";

function isTasksReportPrintRoute(pathname: string) {
  const normalizedPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return normalizedPath === `${MODULE_BASE_PATH}/reports/tasks` || normalizedPath === "/reports/tasks";
}

function getRoleLabel(companyRole: string, isExternal: boolean) {
  const typeLabel = isExternal ? t("users.external") : t("users.internal");
  if (!companyRole.trim()) {
    return typeLabel;
  }
  return `${companyRole} · ${typeLabel}`;
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
    return <Navigate to={`${MODULE_BASE_PATH}/dashboard`} replace />;
  }

  return <>{children}</>;
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { currentUser } = useUsers();
  const { permissions } = useAuthorization();
  const { activeCount } = useNotifications();
  const runtimeConfig = useRuntimeConfig();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState<boolean>(() =>
    loadFromStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, false)
  );
  const [isLogoutPending, setIsLogoutPending] = React.useState(false);
  const safeMode = isSafeModeActive(location.search);
  const reportsEnabled = runtimeConfig.features.enableReports;
  const notificationsEnabled = runtimeConfig.features.enableNotifications;

  React.useEffect(() => {
    saveToStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed);
  }, [sidebarCollapsed]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sidebarCollapsed) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarCollapsed]);

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
      visible: true
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
      visible: reportsEnabled && !currentUser?.isExternal
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
      path: `${MODULE_BASE_PATH}/admin`,
      icon: <AdminIcon />,
      visible: permissions.canViewAdmin
    }
  ];

  const restrictedFallback = currentUser?.isExternal
    ? `${MODULE_BASE_PATH}/tasks`
    : `${MODULE_BASE_PATH}/dashboard`;

  if (isTasksReportPrintRoute(location.pathname)) {
    if (!reportsEnabled) {
      return <Navigate to={restrictedFallback} replace />;
    }
    return <TasksReportPrintPage />;
  }

  const toggleSidebarLabel = sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar");

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      sidebar={
        <Sidebar>
          {!sidebarCollapsed ? <div className="sidebarSectionTitle">{t("nav.module")}</div> : null}
          {navItems
            .filter((item) => item.visible)
            .map((item) => (
              <SidebarNavItem
                key={item.key}
                icon={item.icon}
                collapsed={sidebarCollapsed}
                tooltip={item.label}
                active={location.pathname.startsWith(item.path)}
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
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((value) => !value)}
            >
              <MenuIcon />
            </IconButton>
          }
          right={
            <div className="topbarRight">
              <div className="topbarUserBadge">
                <span className="topbarUserName">
                  {currentUser ? getUserDisplayName(currentUser) : t("topbar.userDemo")}
                </span>
                {currentUser ? (
                  <span className="topbarUserRole">
                    {getRoleLabel(currentUser.companyRole, currentUser.isExternal)}
                  </span>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleLogout()}
                disabled={isLogoutPending}
              >
                {isLogoutPending ? t("auth.logout.pending") : t("auth.logout")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate(`${MODULE_BASE_PATH}/settings/security`)}
              >
                Sicherheit
              </Button>
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
      <ServerStateSync />
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
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
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
            element={permissions.canViewAdmin ? <Navigate to="users" replace /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/users"
            element={permissions.canViewAdmin ? <AdminUsersPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/roles"
            element={permissions.canViewAdmin ? <AdminRolesPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="admin/external-orgs"
            element={permissions.canViewAdmin ? <AdminExternalOrgsPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route path="compliance-summary" element={<ComplianceSummaryPage />} />
          <Route
            path="reports"
            element={reportsEnabled ? <ReportsPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route
            path="notifications"
            element={notificationsEnabled ? <NotificationsPage /> : <Navigate to={restrictedFallback} replace />}
          />
          <Route path="about" element={<AboutPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="settings/security" element={<SecuritySettingsPage />} />
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
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
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
          element={permissions.canViewAdmin ? <Navigate to="/admin/users" replace /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/users"
          element={permissions.canViewAdmin ? <AdminUsersPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/roles"
          element={permissions.canViewAdmin ? <AdminRolesPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/admin/external-orgs"
          element={permissions.canViewAdmin ? <AdminExternalOrgsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route path="/compliance-summary" element={<ComplianceSummaryPage />} />
        <Route
          path="/reports"
          element={reportsEnabled ? <ReportsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route
          path="/notifications"
          element={notificationsEnabled ? <NotificationsPage /> : <Navigate to={restrictedFallback} replace />}
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/settings/security" element={<SecuritySettingsPage />} />
        <Route path="*" element={<Navigate to={`${MODULE_BASE_PATH}/dashboard`} replace />} />
      </Routes>
    </AppShell>
  );
}

function AppRouter() {
  return (
    <Routes>
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
    <ScopesProvider>
      <AuthoritiesProvider>
        <AuthProvider>
          <RolesProvider>
            <ExternalOrgsProvider>
              <UsersProvider>
                <HelpHintsProvider>
                  <AuthorizationProvider>
                    <AuditLogProvider>
                      <ProjectsProvider>
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
                      </ProjectsProvider>
                    </AuditLogProvider>
                  </AuthorizationProvider>
                </HelpHintsProvider>
              </UsersProvider>
            </ExternalOrgsProvider>
          </RolesProvider>
        </AuthProvider>
      </AuthoritiesProvider>
    </ScopesProvider>
  );
}
