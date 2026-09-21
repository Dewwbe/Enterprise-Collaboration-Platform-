import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { ComingSoonPage } from './components/ComingSoonPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
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
              <Route
                path="/organizations"
                element={
                  <ComingSoonPage
                    title="Organizations"
                    description="Create organizations, manage members and roles, and archive or delete them here."
                  />
                }
              />
              <Route
                path="/workspaces"
                element={
                  <ComingSoonPage
                    title="Workspaces"
                    description="View workspace stats, manage members, and browse projects within each workspace."
                  />
                }
              />
              <Route
                path="/notifications"
                element={
                  <ComingSoonPage
                    title="Notifications"
                    description="A live feed of task assignments, comments, and invites, pushed in real time over WebSocket."
                  />
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
