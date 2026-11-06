import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useMe } from '../auth.jsx';
import { PageTitle } from '../components/PageTitle.jsx';
import { PLAN_NAME } from '../format.js';

const ROLES = Object.keys(PLAN_NAME);
const NOW_ON = { free: 'on the Free plan', pro: 'on the Pro plan', admin: 'an admin' };
const joined = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Answers "who needs Pro?": every account, its plan, how much it scans. Plans change here and nowhere else.
export function AdminPage() {
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';
  const queryClient = useQueryClient();
  const [note, setNote] = useState(null);
  const { data: users, isPending, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api('/admin/users').then((d) => d.users),
    enabled: isAdmin,
  });
  const change = useMutation({
    mutationFn: ({ id, role }) => api(`/admin/users/${id}`, { method: 'PATCH', body: { role } }),
    // The note is replaced, never cleared first, so a focused Undo button stays in place while the undo saves.
    onSuccess: ({ user }, { from }) => {
      queryClient.setQueryData(['admin', 'users'], (list) => list.map((u) => (u.id === user.id ? { ...u, role: user.role } : u)));
      setNote({ text: `${user.email} is now ${NOW_ON[user.role]}.`, undo: { id: user.id, role: from, from: user.role } });
    },
    onError: (e) => setNote({ text: e.message, error: true }),
  });

  if (!isAdmin) {
    return (
      <>
        <PageTitle>Admin</PageTitle>
        <h1 className="text-[28px] font-medium">Admin</h1>
        <p className="mt-4 text-muted">Only admins can open this page.</p>
      </>
    );
  }

  return (
    <>
      <PageTitle>Admin</PageTitle>
      <h1 className="text-[28px] font-medium">Admin</h1>
      <p className="mt-1 text-muted">Free gets 3 scans a day, Pro 25, and Admin has no limit plus this page. A change applies at once.</p>
      {/* Always mounted, so screen readers announce each change. */}
      <p role="status" className={`mt-4 min-h-6 ${note?.error ? 'text-sev-critical' : ''}`}>
        {note?.text}
        {note?.undo && (
          <button type="button" onClick={() => !change.isPending && change.mutate(note.undo)} className="ml-2 font-medium underline underline-offset-4 hover:no-underline">
            Undo
          </button>
        )}
      </p>
      {isPending && <p className="mt-2 text-muted">Loading users…</p>}
      {error && <p role="alert" className="mt-2 text-sev-critical">{error.message}</p>}
      {users && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <caption className="sr-only">Users</caption>
            <thead className="text-[14px] text-muted">
              <tr>
                <th className="py-2 pr-4 font-normal">User</th>
                <th className="py-2 pr-4 font-normal">Plan</th>
                <th className="py-2 pr-4 text-right font-normal">Scans</th>
                <th className="py-2 text-right font-normal">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me.id;
                const pending = change.isPending && change.variables.id === u.id;
                return (
                  <tr key={u.id} className="border-t border-rule">
                    <td className="py-3 pr-4">
                      <span className="block font-medium [overflow-wrap:anywhere]">{u.name}{self && <span className="font-normal text-muted"> · You</span>}</span>
                      <span className="block text-[14px] text-muted [overflow-wrap:anywhere]">{u.email}</span>
                    </td>
                    <td className="py-3 pr-4">
                      {self ? (
                        <span>{PLAN_NAME[u.role]}</span>
                      ) : (
                        // Not disabled while saving: a disabled select drops keyboard focus. A second change waits for the first instead.
                        <select
                          aria-label={`Plan for ${u.email}`}
                          aria-busy={pending}
                          value={pending ? change.variables.role : u.role}
                          onChange={(e) => !change.isPending && change.mutate({ id: u.id, role: e.target.value, from: u.role })}
                          className="h-9 rounded-lg border border-rule bg-surface px-3 text-[15px] text-ink"
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{PLAN_NAME[r]}</option>)}
                        </select>
                      )}
                    </td>
                    <td className={`num py-3 pr-4 text-right ${u.scans ? '' : 'text-muted'}`}>{u.scans}</td>
                    <td className="whitespace-nowrap py-3 text-right text-muted">{joined.format(new Date(u.createdAt))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
