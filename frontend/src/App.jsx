import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { Login, Signup, ForgotPassword, ResetPassword, AcceptInvite } from './pages/Auth';

const Overview = lazy(() => import('./pages/Overview'));
const ApiKeys = lazy(() => import('./pages/ApiKeys'));
const Integration = lazy(() => import('./pages/Integration'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Logs = lazy(() => import('./pages/Logs'));
const RateLimits = lazy(() => import('./pages/RateLimits'));
const Quota = lazy(() => import('./pages/Quota'));
const Billing = lazy(() => import('./pages/Billing'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const Center = () => <div className="center-screen"><Spinner size={24} /></div>;

function Protected({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Center />;
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function PublicOnly({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <Center />;
  return status === 'authed' ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Suspense fallback={<Center />}>
      <Routes>
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<PublicOnly><AcceptInvite /></PublicOnly>} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Overview />} />
          <Route path="keys" element={<ApiKeys />} />
          <Route path="integration" element={<Integration />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="logs" element={<Logs />} />
          <Route path="rate-limits" element={<RateLimits />} />
          <Route path="quota" element={<Quota />} />
          <Route path="billing" element={<Billing />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
