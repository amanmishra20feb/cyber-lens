import { NavLink, Outlet, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useState } from 'react';
import { useMe } from '../auth.jsx';
import { Mark } from './Mark.jsx';
import { ResizeHandle, SIDEBAR, clampWidth } from './ResizeHandle.jsx';
import { UserMenu } from './UserMenu.jsx';

export function Shell() {
  const { data: user } = useMe();
  const queryClient = useQueryClient();
  const [width, setWidth] = useState(() => { try { return clampWidth(Number(localStorage.getItem('sidebarWidth')) || SIDEBAR.initial); } catch { return SIDEBAR.initial; } });
  const resize = (w) => {
    setWidth(w);
    try { localStorage.setItem('sidebarWidth', String(w)); } catch { /* the width just will not be remembered */ }
  };
  const navigate = useNavigate();
  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    queryClient.clear();
    navigate('/login');
  };
  const link = ({ isActive }) => `block rounded-lg px-3 py-2 ${isActive ? 'bg-control font-medium text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink'}`;

  return (
    <div className="md:grid md:min-h-dvh md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]" style={{ '--sidebar-w': `${width}px` }}>
      {/* The aside is the full-height column (colour and border); its content stays pinned to the viewport on desktop so the account row never scrolls away on long pages. */}
      <aside className="relative border-b border-rule bg-sidebar md:border-b-0 md:border-r">
        <div className="flex items-center gap-4 px-4 py-3 md:sticky md:top-0 md:h-dvh md:flex-col md:items-stretch md:px-3 md:pb-3 md:pt-6">
          <div className="flex items-center gap-2.5 px-3 text-[20px] font-medium">
            <Mark size={28} /> Cyberlens
          </div>
          <nav className="flex gap-1 md:mt-8 md:flex-col" aria-label="Main">
            <NavLink to="/app" end className={link}>Scans</NavLink>
            {user?.role === 'admin' && <NavLink to="/app/admin" className={link}>Admin</NavLink>}
          </nav>
          <div className="ml-auto min-w-0 md:-ml-3 md:-mr-3 md:mt-auto md:border-t md:border-rule md:px-3 md:pt-3">
            <UserMenu user={user} onSignOut={signOut} />
          </div>
        </div>
        <ResizeHandle width={width} onChange={resize} />
      </aside>
      <main className="min-w-0 px-4 py-8 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
