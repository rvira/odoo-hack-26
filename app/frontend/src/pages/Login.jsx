import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brandrow">
          <span className="logo">E</span>
          <span><b>EcoSphere</b><small>ESG Platform</small></span>
        </div>
        <h1>Sign in</h1>
        <p className="sub">Use your company account to access the ESG workspace.</p>
        {error && <p className="login-err">⚠️ {error}</p>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@acme.com" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn pri" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="demo-hint">
          Demo accounts — <span className="mono">fabien.pinckaers@odoo.com</span> (Super Admin) ·
          admin: <span className="mono">admin@acme.com</span> · employees:{' '}
          <span className="mono">aditi@acme.com</span>, <span className="mono">karan@acme.com</span>,{' '}
          <span className="mono">priya@acme.com</span>, <span className="mono">rohit@acme.com</span>,{' '}
          <span className="mono">sana@acme.com</span>. The demo password is printed by the backend on first start.
        </p>
      </div>
    </div>
  );
}
