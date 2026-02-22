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

const navItems = [
  { key: "dashboard", label: t("nav.dashboard"), path: "/dashboard" },
  { key: "projects", label: t("nav.projects"), path: "/projects" },
  { key: "legal", label: t("nav.legalDocs"), path: "/legal-docs" },
  { key: "obligations", label: t("nav.obligations"), path: "/obligations" },
  { key: "tasks", label: t("nav.tasks"), path: "/tasks" },
  { key: "deadlines", label: t("nav.deadlines"), path: "/deadlines" },
  { key: "scopes", label: t("nav.scopes"), path: "/scopes" },
  { key: "admin", label: t("nav.admin"), path: "/admin", adminOnly: true }
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
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
