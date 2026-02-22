import React from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  AppShell,
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
import BescheideDashboardPage from "./pages/bescheide/DashboardPage";
import BescheideProjectsPage from "./pages/bescheide/ProjectsPage";
import BescheideLegalDocsPage from "./pages/bescheide/LegalDocsPage";
import BescheideObligationsPage from "./pages/bescheide/ObligationsPage";
import BescheideTasksPage from "./pages/bescheide/TasksPage";
import BescheideDeadlinesPage from "./pages/bescheide/DeadlinesPage";
import BescheideScopesPage from "./pages/bescheide/ScopesPage";
import BescheideAdminPage from "./pages/bescheide/AdminPage";
import { BellIcon } from "./components/Icons";
import { ScopesProvider } from "./state/ScopesStore";
import { ProjectsProvider } from "./state/ProjectsStore";
import { AuthoritiesProvider } from "./state/AuthoritiesStore";
import { UsersProvider } from "./state/UsersStore";
import { LegalDocsProvider } from "./state/LegalDocsStore";
import { ObligationsProvider } from "./state/ObligationsStore";
import { DeadlinesProvider } from "./state/DeadlinesStore";
import { TasksProvider } from "./state/TasksStore";

const isAdmin = true;
const userName = "Mario Prammer";
const MODULE_PREFIX = "bescheide";
const MODULE_BASE_PATH = `/${MODULE_PREFIX}`;

const navItems = [
  { key: "dashboard", label: t("nav.dashboard"), path: `${MODULE_BASE_PATH}/dashboard` },
  { key: "projects", label: t("nav.projects"), path: `${MODULE_BASE_PATH}/projects` },
  { key: "legal", label: t("nav.legalDocs"), path: `${MODULE_BASE_PATH}/legal-docs` },
  { key: "obligations", label: t("nav.obligations"), path: `${MODULE_BASE_PATH}/obligations` },
  { key: "tasks", label: t("nav.tasks"), path: `${MODULE_BASE_PATH}/tasks` },
  { key: "deadlines", label: t("nav.deadlines"), path: `${MODULE_BASE_PATH}/deadlines` },
  { key: "scopes", label: t("nav.scopes"), path: `${MODULE_BASE_PATH}/scopes` },
  { key: "admin", label: t("nav.admin"), path: `${MODULE_BASE_PATH}/admin`, adminOnly: true }
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ScopesProvider>
      <AuthoritiesProvider>
        <UsersProvider>
          <ProjectsProvider>
            <LegalDocsProvider>
              <ObligationsProvider>
                <DeadlinesProvider>
                  <TasksProvider>
                    <AppShell
                      sidebar={
                        <Sidebar>
                          <div className="sidebarSectionTitle">{t("nav.module")}</div>
                          {navItems
                            .filter((item) => (item.adminOnly ? isAdmin : true))
                            .map((item) => (
                              <SidebarNavItem
                                key={item.key}
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
                        <Route path="/" element={<Navigate to={`${MODULE_BASE_PATH}/dashboard`} replace />} />
                        <Route path={MODULE_PREFIX}>
                          <Route index element={<Navigate to="dashboard" replace />} />
                          <Route path="dashboard" element={<BescheideDashboardPage />} />
                          <Route path="projects" element={<BescheideProjectsPage />} />
                          <Route path="legal-docs" element={<BescheideLegalDocsPage />} />
                          <Route path="obligations" element={<BescheideObligationsPage />} />
                          <Route path="tasks" element={<BescheideTasksPage />} />
                          <Route path="deadlines" element={<BescheideDeadlinesPage />} />
                          <Route path="scopes" element={<BescheideScopesPage />} />
                          <Route path="admin" element={<BescheideAdminPage />} />
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
                        <Route path="*" element={<Navigate to={`${MODULE_BASE_PATH}/dashboard`} replace />} />
                      </Routes>
                    </AppShell>
                  </TasksProvider>
                </DeadlinesProvider>
              </ObligationsProvider>
            </LegalDocsProvider>
          </ProjectsProvider>
        </UsersProvider>
      </AuthoritiesProvider>
    </ScopesProvider>
  );
}
