import React from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  AppShell,
  IconButton,
  Sidebar,
  SidebarNavItem,
  Topbar
} from "@nemetz/ui";
import { t } from "./i18n";
import TasksPage from "./pages/TasksPage";
import TaskDetailPage from "./pages/TaskDetailPage";
import LegalDocPage from "./pages/LegalDocPage";
import UiDemoPage from "./pages/UiDemoPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import LegalDocsPage from "./pages/LegalDocsPage";
import ScopesPage from "./pages/ScopesPage";
import AdminPage from "./pages/AdminPage";
import DashboardPage from "./pages/DashboardPage";
import ObligationsPage from "./pages/ObligationsPage";
import ObligationDetailPage from "./pages/ObligationDetailPage";
import DeadlinesPage from "./pages/DeadlinesPage";
import DeadlineDetailPage from "./pages/DeadlineDetailPage";
import ComplianceSummaryPage from "./pages/ComplianceSummaryPage";
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
import { UsersProvider } from "./state/UsersStore";
import { LegalDocsProvider } from "./state/LegalDocsStore";
import { ObligationsProvider } from "./state/ObligationsStore";
import { DeadlinesProvider } from "./state/DeadlinesStore";
import { TasksProvider } from "./state/TasksStore";
import { AuthorizationProvider } from "./state/AuthorizationStore";
import { AuditLogProvider } from "./state/AuditLogStore";
import { TaskStateProvider } from "./state/TaskStateStore";
import { loadFromStorage, saveToStorage } from "./state/storage";

const isAdmin = true;
const currentUserId = "u-001";
const MODULE_PREFIX = "compliance";
const MODULE_BASE_PATH = `/${MODULE_PREFIX}`;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "nemetz.sidebarCollapsed";

const navItems = [
  {
    key: "dashboard",
    label: t("nav.dashboard"),
    path: `${MODULE_BASE_PATH}/dashboard`,
    icon: <DashboardIcon />
  },
  {
    key: "projects",
    label: t("nav.projects"),
    path: `${MODULE_BASE_PATH}/projects`,
    icon: <ProjectsIcon />
  },
  {
    key: "legal",
    label: t("nav.legalDocs"),
    path: `${MODULE_BASE_PATH}/legal-docs`,
    icon: <LegalDocIcon />
  },
  {
    key: "obligations",
    label: t("nav.obligations"),
    path: `${MODULE_BASE_PATH}/obligations`,
    icon: <ObligationIcon />
  },
  {
    key: "tasks",
    label: t("nav.tasks"),
    path: `${MODULE_BASE_PATH}/tasks`,
    icon: <TasksIcon />
  },
  {
    key: "deadlines",
    label: t("nav.deadlines"),
    path: `${MODULE_BASE_PATH}/deadlines`,
    icon: <DeadlinesIcon />
  },
  {
    key: "scopes",
    label: t("nav.scopes"),
    path: `${MODULE_BASE_PATH}/scopes`,
    icon: <ScopesIcon />
  },
  {
    key: "admin",
    label: t("nav.admin"),
    path: `${MODULE_BASE_PATH}/admin`,
    icon: <AdminIcon />,
    adminOnly: true
  }
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const userName = t("topbar.userDemo");
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState<boolean>(() =>
    loadFromStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, false)
  );

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

  const handleToggleSidebar = () => {
    setSidebarCollapsed((current) => !current);
  };

  const toggleSidebarLabel = sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar");

  return (
    <ScopesProvider>
      <AuthoritiesProvider>
        <UsersProvider>
          <AuthorizationProvider actor={{ userId: currentUserId, isAdmin, isExternal: false }}>
            <AuditLogProvider>
              <ProjectsProvider>
                <LegalDocsProvider>
                  <ObligationsProvider>
                    <DeadlinesProvider>
                      <TaskStateProvider>
                        <TasksProvider>
                          <AppShell
                        sidebarCollapsed={sidebarCollapsed}
                        sidebar={
                          <Sidebar>
                            {!sidebarCollapsed ? (
                              <div className="sidebarSectionTitle">{t("nav.module")}</div>
                            ) : null}
                            {navItems
                              .filter((item) => (item.adminOnly ? isAdmin : true))
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
                                onClick={handleToggleSidebar}
                              >
                                <MenuIcon />
                              </IconButton>
                            }
                            right={
                              <div className="topbarRight">
                                <div className="topbarUser">
                                  <span>{userName}</span>
                                </div>
                                <div
                                  className="topbarBell"
                                  role="img"
                                  aria-label={t("topbar.notifications")}
                                >
                                  <BellIcon />
                                </div>
                              </div>
                            }
                          />
                        }
                      >
                          <Routes>
                            <Route
                              path="/"
                              element={<Navigate to={`${MODULE_BASE_PATH}/dashboard`} replace />}
                            />
                            <Route path={MODULE_PREFIX}>
                              <Route index element={<Navigate to="dashboard" replace />} />
                              <Route path="dashboard" element={<DashboardPage />} />
                              <Route path="projects" element={<ProjectsPage />} />
                              <Route path="projects/:id" element={<ProjectDetailPage />} />
                              <Route path="legal-docs" element={<LegalDocsPage />} />
                              <Route path="legal-docs/:id" element={<LegalDocPage />} />
                              <Route path="obligations" element={<ObligationsPage />} />
                              <Route path="obligations/:id" element={<ObligationDetailPage />} />
                              <Route path="tasks" element={<TasksPage />} />
                              <Route path="tasks/:id" element={<TaskDetailPage />} />
                              <Route path="deadlines" element={<DeadlinesPage />} />
                              <Route path="deadlines/:id" element={<DeadlineDetailPage />} />
                              <Route path="scopes" element={<ScopesPage />} />
                              <Route path="admin" element={<AdminPage />} />
                              <Route path="compliance-summary" element={<ComplianceSummaryPage />} />
                              <Route path="reports" element={<ComplianceSummaryPage />} />
                            </Route>
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/ui-demo" element={<UiDemoPage />} />
                            <Route path="/projects" element={<ProjectsPage />} />
                            <Route path="/projects/:id" element={<ProjectDetailPage />} />
                            <Route path="/legal-docs" element={<LegalDocsPage />} />
                            <Route path="/legal-docs/:id" element={<LegalDocPage />} />
                            <Route path="/obligations" element={<ObligationsPage />} />
                            <Route path="/obligations/:id" element={<ObligationDetailPage />} />
                            <Route path="/tasks" element={<TasksPage />} />
                            <Route path="/tasks/:id" element={<TaskDetailPage />} />
                            <Route path="/deadlines" element={<DeadlinesPage />} />
                            <Route path="/deadlines/:id" element={<DeadlineDetailPage />} />
                            <Route path="/scopes" element={<ScopesPage />} />
                            <Route path="/admin" element={<AdminPage />} />
                            <Route path="/compliance-summary" element={<ComplianceSummaryPage />} />
                            <Route path="/reports" element={<ComplianceSummaryPage />} />
                            <Route
                              path="*"
                              element={<Navigate to={`${MODULE_BASE_PATH}/dashboard`} replace />}
                            />
                          </Routes>
                        </AppShell>
                      </TasksProvider>
                    </TaskStateProvider>
                  </DeadlinesProvider>
                </ObligationsProvider>
              </LegalDocsProvider>
            </ProjectsProvider>
          </AuditLogProvider>
          </AuthorizationProvider>
        </UsersProvider>
      </AuthoritiesProvider>
    </ScopesProvider>
  );
}
