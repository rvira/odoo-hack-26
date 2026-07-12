import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Shell from './components/Shell.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Environmental from './pages/Environmental.jsx';
import Social from './pages/Social.jsx';
import Governance from './pages/Governance.jsx';
import Gamification from './pages/Gamification.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

function RequireAuth({ children }) {
  const { isAuthed } = useAuth();
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user || user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

// The super role is platform-tier: it only sees the Dashboard (every
// org-scoped route 403s server-side, so don't even route it there).
function RequireOrgUser({ children }) {
  const { user } = useAuth();
  if (!user || user.role === 'super') return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { isAuthed } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthed ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/environmental" element={<RequireAdmin><Navigate to="/environmental/transactions" replace /></RequireAdmin>} />
        <Route path="/environmental/:tab" element={<RequireAdmin><Environmental /></RequireAdmin>} />
        <Route path="/social" element={<Navigate to="/social/csr" replace />} />
        <Route path="/social/:tab" element={<RequireOrgUser><Social /></RequireOrgUser>} />
        <Route path="/governance" element={<Navigate to="/governance/policies" replace />} />
        <Route path="/governance/:tab" element={<RequireOrgUser><Governance /></RequireOrgUser>} />
        <Route path="/gamification" element={<Navigate to="/gamification/challenges" replace />} />
        <Route path="/gamification/:tab" element={<RequireOrgUser><Gamification /></RequireOrgUser>} />
        <Route path="/reports" element={<RequireAdmin><Navigate to="/reports/summary" replace /></RequireAdmin>} />
        <Route path="/reports/:tab" element={<RequireAdmin><Reports /></RequireAdmin>} />
        <Route path="/settings" element={<RequireAdmin><Navigate to="/settings/departments" replace /></RequireAdmin>} />
        <Route path="/settings/:tab" element={<RequireAdmin><Settings /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthed ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
