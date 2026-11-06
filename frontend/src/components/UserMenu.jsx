import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { PLAN_NAME } from '../format.js';

const item = 'block w-full rounded-lg px-3 py-2 text-left hover:bg-control focus-visible:bg-control';

// Default avatar: a plain person glyph, since accounts have no photo.
const UserIcon = () => (
  <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-control text-muted">
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" /></svg>
  </span>
);

// The account button in the sidebar: icon, name, plan. Opens a small menu with the email, Settings and Sign out.
export function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return;
    root.current.querySelector('[role=menuitem]').focus();
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && root.current.contains(e.target)) return;
      setOpen(false);
      if (e.type === 'keydown') button.current.focus();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const arrows = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...root.current.querySelectorAll('[role=menuitem]')];
    items[(items.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  };

  return (
    <div ref={root} className="relative min-w-0" onKeyDown={arrows}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-left hover:bg-control aria-expanded:bg-control"
      >
        <UserIcon />
        {/* Name and plan are both always shown. At the 224px minimum a normal name fits beside the plan; a longer one wraps the plan under it. Only a name wider than the whole row is cut with an ellipsis. */}
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="max-w-full truncate font-medium">{user?.name}</span>
          {PLAN_NAME[user?.role] && <span className="hidden shrink-0 text-[12px] text-muted md:inline"><span aria-hidden="true">·</span> {PLAN_NAME[user.role]}</span>}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-xl border border-rule bg-surface p-1 shadow-[0_8px_24px_rgb(0_0_0/.12)] md:bottom-full md:left-0 md:right-auto md:top-auto md:mb-1 md:mt-0">
          <p className="truncate px-3 py-2 text-[14px] text-muted" title={user?.email}>{user?.email}</p>
          <div role="menu" aria-label="Account" className="border-t border-rule pt-1">
            {user?.role === 'free' && <Link role="menuitem" to="/app/upgrade" onClick={() => setOpen(false)} className={item}>Upgrade to Pro</Link>}
            <Link role="menuitem" to="/app/settings" onClick={() => setOpen(false)} className={item}>Settings</Link>
            <button role="menuitem" type="button" onClick={onSignOut} className={item}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}
