import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from './Toast.jsx';

export const KIND_BG = {
  env: 'var(--env-soft)',
  soc: 'var(--soc-soft)',
  gov: 'var(--gov-soft)',
  game: 'var(--game-soft)',
  danger: 'var(--danger-soft)',
  compliance: 'var(--danger-soft)',
};

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const list = await api('/notifications');
      setItems(Array.isArray(list) ? list : []);
    } catch { /* bell stays quiet if the fetch fails */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const unread = (items || []).some((n) => !n.read);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const markAllRead = async () => {
    try {
      await api('/notifications/read-all', { method: 'POST' });
      toast('All notifications marked read');
      load();
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <>
      <header className="topbar">
        <button className="iconbtn" id="menuBtn" aria-label="Open menu" onClick={onMenu}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="search" role="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-3-3" />
          </svg>
          Search records, challenges, policies…<kbd>⌘K</kbd>
        </div>
        <div className="spacer" />
        <button className="iconbtn" aria-label="Notifications" onClick={toggleOpen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0" />
          </svg>
          {unread && <span className="ping" />}
        </button>
        <div className="whoami">
          <span className="who"><b>{user ? user.name : ''}</b><span>{user ? user.role : ''}</span></span>
          <span className="avatar">{user ? user.initials : ''}</span>
        </div>
        <button className="iconbtn" aria-label="Sign out" title="Sign out" onClick={logout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </header>

      {open && (
        <div className="notif" ref={panelRef} aria-label="Notifications panel">
          <header>
            Notifications <button onClick={markAllRead}>Mark all read</button>
          </header>
          <ul>
            {items === null && <li className="nempty">Loading…</li>}
            {items !== null && items.length === 0 && <li className="nempty">You're all caught up 🎉</li>}
            {(items || []).map((n) => (
              <li key={n.id} className={n.read ? '' : 'unread'}>
                <span className="nico" style={{ background: KIND_BG[n.kind] || 'var(--line2)' }}>{n.icon}</span>
                <span className="ntext">{n.text}<time>{n.when}</time></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
