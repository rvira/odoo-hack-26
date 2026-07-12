import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

// Mirrors the wireframe's MODULES nav model. Pillar modules keep their pillar
// accent; non-pillar entries (Dashboard/Reporting/Settings) use the framework
// primary. The super role only ever sees the Dashboard.
export const MODULES = [
  { id: 'dashboard', label: 'Dashboard', grp: 'Overview', icon: 'grid', acc: 'pri', roles: ['admin', 'employee', 'super'], first: '' },
  { id: 'environmental', label: 'Environmental', grp: 'Modules', icon: 'leaf', acc: 'env', roles: ['admin'], first: '/transactions' },
  { id: 'social', label: 'Social', grp: 'Modules', icon: 'users', acc: 'soc', roles: ['admin', 'employee'], first: '/csr' },
  { id: 'governance', label: 'Governance', grp: 'Modules', icon: 'shield', acc: 'gov', roles: ['admin', 'employee'], first: '/policies' },
  { id: 'gamification', label: 'Gamification', grp: 'Modules', icon: 'trophy', acc: 'game', roles: ['admin', 'employee'], first: '/challenges' },
  { id: 'reports', label: 'Reporting', grp: 'Insights', icon: 'doc', acc: 'pri', roles: ['admin'], first: '/summary' },
  { id: 'settings', label: 'Settings', grp: 'Insights', icon: 'cog', acc: 'pri', roles: ['admin'], first: '/departments' },
];

const ICONS = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  leaf: 'M5 21c0-8 6-14 14-14 0 8-6 14-14 14zM5 21c4-4 7-7 10-9',
  users: 'M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 20v-2a4 4 0 0 0-3-3.9',
  shield: 'M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6z',
  trophy: 'M8 4h8v4a4 4 0 0 1-8 0zM6 4H4v2a3 3 0 0 0 3 3M18 4h2v2a3 3 0 0 1-3 3M9 15h6M10 15v5M14 15v5M8 20h8',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M4 12h1M19 12h1M12 4v1M12 19v1M6 6l.7.7M17.3 17.3l.7.7M6 18l.7-.7M17.3 6.7l.7-.7',
};

const ACCENT = { pri: 'var(--side-accent)', env: 'var(--env)', soc: 'var(--soc)', gov: 'var(--gov)', game: 'var(--game-acc)' };

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>
  );
}

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const role = user ? user.role : 'employee';
  const modules = MODULES.filter((m) => m.roles.includes(role));

  // Super footer shows the platform org count (from the dashboard payload).
  const [orgCount, setOrgCount] = useState(null);
  useEffect(() => {
    if (role !== 'super') return undefined;
    let on = true;
    api('/dashboard')
      .then((d) => { if (on && d && d.kpis) setOrgCount(d.kpis.organizations); })
      .catch(() => { /* footer falls back to a plain label */ });
    return () => { on = false; };
  }, [role]);

  const footer = role === 'super'
    ? `Platform · ${orgCount ?? '…'} organizations`
    : user && user.org
      ? `${user.org.name} · OUID ${user.org.ouid}`
      : user ? user.name : '';

  let lastGrp = '';
  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
      <div className="brand">
        <span className="logo">E</span>
        <span><b>EcoSphere</b><small>ESG Platform</small></span>
      </div>
      <nav className="nav">
        {modules.map((m) => {
          const showGrp = m.grp !== lastGrp;
          lastGrp = m.grp;
          const active = pathname === `/${m.id}` || pathname.startsWith(`/${m.id}/`);
          return (
            <span key={m.id} style={{ display: 'contents' }}>
              {showGrp && <p className="grp">{m.grp}</p>}
              <Link to={`/${m.id}${m.first}`} onClick={onClose} aria-current={active ? 'page' : undefined}>
                <Icon name={m.icon} />
                {m.label}
                {active && <span className="dot" style={{ background: ACCENT[m.acc] }} />}
              </Link>
            </span>
          );
        })}
      </nav>
      <div className="side-foot">{footer}</div>
    </aside>
  );
}
