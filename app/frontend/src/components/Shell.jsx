import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function Shell() {
  const [sideOpen, setSideOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setSideOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <div className={`backdrop${sideOpen ? ' show' : ''}`} onClick={() => setSideOpen(false)} />
      <div className="shell">
        <Sidebar open={sideOpen} onClose={() => setSideOpen(false)} />
        <div className="main">
          <Topbar onMenu={() => setSideOpen(true)} />
          <main className="content">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
