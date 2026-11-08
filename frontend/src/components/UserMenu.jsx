import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

const item = 'block w-full rounded-lg px-3 py-2 text-left hover:bg-control focus-visible:bg-control';

// accounts have no photo, so everyone gets the same person icon
const UserIcon = () => (
  <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-control text-muted">
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" /></svg>
  </span>
);

// Account button at the bottom of the sidebar; opens a menu with Settings and Sign out.
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
        <span className="min-w-0 truncate font-medium max-sm:sr-only">{user?.name}</span>
      </button>
      {open && (
        <div className="pop absolute right-0 top-full z-10 mt-1 w-56 origin-top-right rounded-xl border border-rule bg-surface p-1 shadow-[0_8px_24px_rgb(0_0_0/.12)] md:bottom-full md:left-0 md:right-auto md:top-auto md:mb-1 md:mt-0 md:origin-bottom-left">
          <p className="truncate px-3 py-2 text-[14px] text-muted" title={user?.email}>{user?.email}</p>
          <div role="menu" aria-label="Account" className="border-t border-rule pt-1">
            <Link role="menuitem" to="/app/settings" onClick={() => setOpen(false)} className={item}>Settings</Link>
            <button role="menuitem" type="button" onClick={onSignOut} className={item}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}
