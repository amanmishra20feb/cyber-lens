import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { PageTitle } from '../components/PageTitle.jsx';
import { FINAL, SCAN_STATUS_TEXT, SEVERITIES, SEVERITY_TEXT, repoName, summary, timeAgo } from '../format.js';

const GROUPS = {
  all: { label: 'All', has: () => true },
  done: { label: 'Done', has: (s) => s.status === 'done' },
  running: { label: 'Running', has: (s) => !FINAL.includes(s.status) },
  failed: { label: 'Failed', has: (s) => s.status === 'failed' },
  cancelled: { label: 'Cancelled', has: (s) => s.status === 'cancelled' },
};
const LIMIT = 50; // the API sends the newest 50

export function HistoryPage() {
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const { data, isPending, error } = useQuery({
    queryKey: ['scans'],
    queryFn: () => api('/scans').then((d) => d.scans),
    refetchInterval: (q) => (q.state.data?.some((s) => !FINAL.includes(s.status)) ? 2000 : false),
  });

  // tab counts follow the search, like the findings tabs
  const matching = (data ?? []).filter((s) => repoName(s.repoUrl).toLowerCase().includes(search.trim().toLowerCase()));
  const rows = matching.filter(GROUPS[group].has);

  return (
    <>
      <PageTitle>History</PageTitle>
      <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-[32px] font-medium">History</h1>
          {data && <p className="mt-2 text-[17px] text-muted">{data.length === 0 ? 'No scans yet.' : data.length === LIMIT ? `Your latest ${LIMIT} scans, newest first.` : `${data.length} ${data.length === 1 ? 'scan' : 'scans'}, newest first.`}</p>}
        </div>
        <Link to="/app" className="inline-flex h-12 items-center rounded-lg border border-rule px-5 font-medium hover:bg-ink/5">New scan</Link>
      </div>

      {isPending && <p className="mt-8 text-muted">Loading scans…</p>}
      {error && <p role="alert" className="mt-8 text-sev-critical">{error.message}</p>}
      {data?.length === 0 && (
        <p className="mt-8 text-muted">Scans you run show up here. <Link to="/app" className="text-ink underline underline-offset-4">Scan a repository</Link></p>
      )}

      {data?.length > 0 && (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Status">
              {Object.entries(GROUPS).map(([key, { label, has }]) => (
                <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)} className={`h-11 rounded-lg px-4 ${group === key ? 'bg-control font-medium text-ink' : 'text-muted hover:text-ink'}`}>
                  {label} <span className="num">{matching.filter(has).length}</span>
                </button>
              ))}
            </div>
            <label className="block">
              <span className="sr-only">Search by repository</span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by repository" className="h-11 w-full rounded-lg border border-rule bg-surface px-4 text-[16px] placeholder:text-muted sm:w-80" />
            </label>
          </div>

          {rows.length === 0 ? (
            <p className="mt-8 text-muted">
              No scans match.{' '}
              <button type="button" onClick={() => { setGroup('all'); setSearch(''); }} className="text-ink underline underline-offset-4">Clear filters</button>
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left md:min-w-[720px]">
                <thead className="text-[15px] text-muted">
                  <tr>
                    <th className="py-2 pr-4 font-normal">Repository</th>
                    <th className="hidden py-2 pr-4 font-normal md:table-cell">Status</th>
                    {SEVERITIES.map((s) => <th key={s} className="hidden py-2 pr-4 text-right font-normal md:table-cell">{SEVERITY_TEXT[s]}</th>)}
                    <th className="py-2 text-right font-normal">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((scan) => {
                    const done = scan.status === 'done';
                    return (
                      <tr key={scan.id} className="h-14 border-t border-rule hover:bg-ink/5 max-md:h-16">
                        <td className="pr-4">
                          <Link to={`/app/scans/${scan.id}`} className="font-medium underline-offset-4 hover:underline">{repoName(scan.repoUrl)}</Link>
                          {scan.branch && <span className="ml-2 text-muted">{scan.branch}</span>}
                          <span className="block text-[14px] text-muted md:hidden">{summary(scan)}</span>
                        </td>
                        <td className={`hidden pr-4 md:table-cell ${scan.status === 'failed' ? 'text-sev-critical' : FINAL.includes(scan.status) ? 'text-muted' : 'text-data'}`}>{SCAN_STATUS_TEXT[scan.status]}</td>
                        {SEVERITIES.map((s) => (
                          <td key={s} className={`num hidden pr-4 text-right md:table-cell ${done && scan.counts[s] ? '' : 'text-muted'}`}>{done ? scan.counts[s] : '—'}</td>
                        ))}
                        <td className="text-right text-muted">{timeAgo(scan.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      </div>
    </>
  );
}
