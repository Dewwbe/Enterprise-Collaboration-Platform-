import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { OrganizationDetailPage } from './pages/OrganizationDetailPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspaceDetailPage } from './pages/WorkspaceDetailPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { NotificationsPage } from './pages/NotificationsPage';

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <NotificationsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/organizations" element={<OrganizationsPage />} />
                <Route
                  path="/organizations/:organizationId"
                  element={<OrganizationDetailPage />}
                />
                <Route path="/workspaces" element={<WorkspacesPage />} />
                <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
                <Route
                  path="/workspaces/:workspaceId/projects/:projectId"
                  element={<ProjectDetailPage />}
                />
                <Route path="/notifications" element={<NotificationsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </NotificationsProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
