import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { PageTitle } from '../components/PageTitle.jsx';
import { FINAL, SEVERITIES, STATUS_TEXT, repoName, timeAgo } from '../format.js';

const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

function NewScan() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [large, setLarge] = useState(null); // a repo over the size limit: waiting for the user to choose
  const form = useRef(null);
  const start = useMutation({
    mutationFn: (body) => api('/scans', { body }),
    onSuccess: ({ scan }) => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      navigate(`/app/scans/${scan.id}`);
    },
    onError: (e, body) => (e.code === 'repo_too_large' ? setLarge({ message: e.message, body }) : setError(e.message)),
  });
  const submit = (e) => {
    e.preventDefault();
    setError('');
    setLarge(null);
    start.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  };

  return (
    <form ref={form} onSubmit={submit} onChange={() => large && setLarge(null)} className="mt-6 rounded-xl bg-surface p-6">
      <div className="flex flex-wrap gap-4">
        <label className="min-w-0 basis-full xl:flex-1 xl:basis-0">
          <span className="sr-only">Public GitHub repo URL</span>
          <input name="repoUrl" required placeholder="https://github.com/owner/repo" aria-describedby={error ? 'scan-error' : undefined} className="h-12 w-full rounded-lg border border-rule bg-surface px-4 text-[16px] placeholder:text-muted" />
        </label>
        <label className="min-w-0 flex-1 xl:w-56 xl:flex-none">
          <span className="sr-only">Branch (optional)</span>
          <input name="branch" placeholder="Default branch" className="h-12 w-full rounded-lg border border-rule bg-surface px-4 text-[16px] placeholder:text-muted" />
        </label>
        <button disabled={start.isPending} className="h-12 rounded-lg bg-ink px-7 text-[16px] font-medium text-bg hover:opacity-90 disabled:opacity-60">
          {start.isPending ? 'Starting…' : 'Scan'}
        </button>
      </div>
      {large && (
        <div role="alert" className="mt-4 rounded-xl border border-rule p-4">
          <p className="font-medium">{large.message}</p>
          <p className="mt-1 text-muted">Cyberlens can still scan it: files over 1 MB, usually videos, datasets and archives, are skipped, and the result lists what was left out.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" autoFocus disabled={start.isPending} onClick={() => start.mutate({ ...large.body, skipLarge: true })} className="h-10 rounded-lg bg-ink px-5 font-medium text-bg hover:opacity-90 disabled:opacity-60">
              {start.isPending ? 'Starting…' : 'Scan without large files'}
            </button>
            <button type="button" disabled={start.isPending} onClick={() => { setLarge(null); form.current.elements.repoUrl.focus(); }} className="h-10 rounded-lg bg-control px-5 font-medium hover:opacity-90 disabled:opacity-60">
              Do not scan
            </button>
          </div>
        </div>
      )}
      {error && <p id="scan-error" role="alert" className="mt-3 text-sev-critical">{error}</p>}
    </form>
  );
}

export function ScansPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['scans'],
    queryFn: () => api('/scans').then((d) => d.scans),
    refetchInterval: (q) => (q.state.data?.some((s) => !FINAL.includes(s.status)) ? 2000 : false),
  });

  return (
    <>
      <PageTitle>Scans</PageTitle>
      <h1 className="text-[28px] font-medium">Scans</h1>
      <NewScan />
      <section className="mt-12" aria-labelledby="history">
        <h2 id="history" className="text-[22px] font-medium">History</h2>
        {isPending && <p className="mt-4 text-muted">Loading scans…</p>}
        {error && <p role="alert" className="mt-4 text-sev-critical">{error.message}</p>}
        {data?.length === 0 && <p className="mt-4 text-muted">No scans yet. Paste a public GitHub repo URL above to run your first scan.</p>}
        {data?.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="text-[14px] text-muted">
                <tr>
                  <th className="py-2 pr-4 font-normal">Repository</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                  {SEVERITIES.map((s) => <th key={s} className="py-2 pr-4 text-right font-normal">{SEV_LABEL[s]}</th>)}
                  <th className="py-2 text-right font-normal">Started</th>
                </tr>
              </thead>
              <tbody>
                {data.map((scan) => {
                  const done = scan.status === 'done';
                  return (
                    <tr key={scan.id} className="h-12 border-t border-rule">
                      <td className="pr-4">
                        <Link to={`/app/scans/${scan.id}`} className="font-medium hover:underline underline-offset-4">{repoName(scan.repoUrl)}</Link>
                        {scan.branch && <span className="ml-2 text-muted">{scan.branch}</span>}
                      </td>
                      <td className={`pr-4 ${scan.status === 'failed' ? 'text-sev-critical' : FINAL.includes(scan.status) ? 'text-muted' : 'text-data'}`}>{STATUS_TEXT[scan.status]}</td>
                      {SEVERITIES.map((s) => (
                        <td key={s} className={`num pr-4 text-right ${done && scan.counts[s] ? '' : 'text-muted'}`}>{done ? scan.counts[s] : '—'}</td>
                      ))}
                      <td className="text-right text-muted">{timeAgo(scan.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
