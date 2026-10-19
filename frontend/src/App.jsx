import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProjectsProvider } from './context/ProjectsContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import { Spinner } from './components/ui';

const Overview = lazy(() => import('./pages/Overview'));
const ApiKeys = lazy(() => import('./pages/ApiKeys'));
const Projects = lazy(() => import('./pages/Projects'));
const Usage = lazy(() => import('./pages/Usage'));
const RateLimits = lazy(() => import('./pages/RateLimits'));
const Logs = lazy(() => import('./pages/Logs'));
const Spend = lazy(() => import('./pages/Spend'));
const Billing = lazy(() => import('./pages/Billing'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const Center = () => <div className="center-screen"><Spinner size={24} /></div>;

function Protected({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Center />;
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location }} />;
  return <ProjectsProvider>{children}</ProjectsProvider>;
}

export default function App() {
  const { status } = useAuth();
  return (
    <Suspense fallback={<Center />}>
      <Routes>
        <Route path="/login" element={status === 'authed' ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Overview />} />
          <Route path="keys" element={<ApiKeys />} />
          <Route path="projects" element={<Projects />} />
          <Route path="usage" element={<Usage />} />
          <Route path="rate-limits" element={<RateLimits />} />
          <Route path="logs" element={<Logs />} />
          <Route path="spend" element={<Spend />} />
          <Route path="billing" element={<Billing />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
