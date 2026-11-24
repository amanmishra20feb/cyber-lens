import { useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { PageTitle } from '../components/PageTitle.jsx';
import { ENGINE_NAMES, FINAL, SCAN_STATUS_TEXT, repoName } from '../format.js';

const EXAMPLE = 'https://github.com/OWASP/NodeGoat';
const ENGINE_TEXT = {
  semgrep: 'Reads the code for risky patterns, with our own rules added.',
  gitleaks: 'Looks for passwords and keys left in the code.',
  osv: 'Checks the libraries a project uses against known vulnerabilities.',
};
const input = 'block w-full rounded-lg border border-rule bg-surface px-4 text-[16px] placeholder:text-muted';

function NewScan() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const repo = useRef(null);
  const start = useMutation({
    mutationFn: (body) => api('/scans', { body }),
    onSuccess: ({ scan }) => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      navigate(`/app/scans/${scan.id}`);
    },
  });
  const submit = (e) => {
    e.preventDefault();
    start.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  };

  return (
    <form onSubmit={submit} className="mt-8">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
        <div>
          <label htmlFor="repo" className="block font-medium">Repository</label>
          <input ref={repo} id="repo" name="repoUrl" defaultValue={params.get('repo') ?? ''} required placeholder="https://github.com/owner/repo" aria-describedby={start.error ? 'scan-error' : undefined} className={`${input} mt-2 h-14`} />
        </div>
        <div>
          <label htmlFor="branch" className="block font-medium">Branch</label>
          <input id="branch" name="branch" placeholder="Default branch" className={`${input} mt-2 h-14`} />
        </div>
        <button disabled={start.isPending} className="h-14 rounded-lg bg-ink px-9 text-[16px] font-medium text-bg hover:opacity-90 disabled:opacity-60 sm:self-end">
          {start.isPending ? 'Starting…' : 'Scan'}
        </button>
      </div>
      <p className="mt-3 text-[14px] text-muted">
        No repo in mind?{' '}
        <button type="button" onClick={() => { repo.current.value = EXAMPLE; repo.current.focus(); }} className="underline underline-offset-4 hover:no-underline">Try OWASP/NodeGoat</button>
      </p>
      {start.error && <p id="scan-error" role="alert" className="mt-4 text-sev-critical">{start.error.message}</p>}
    </form>
  );
}

export function ScansPage() {
  const { data } = useQuery({
    queryKey: ['scans'],
    queryFn: () => api('/scans').then((d) => d.scans),
    refetchInterval: (q) => (q.state.data?.some((s) => !FINAL.includes(s.status)) ? 2000 : false),
  });
  const running = data?.find((s) => !FINAL.includes(s.status));

  return (
    <>
      <PageTitle>New scan</PageTitle>
      <div className="max-w-6xl">
        <h1 className="text-[32px] font-medium">New scan</h1>
        <p className="mt-2 max-w-[65ch] text-[17px] text-muted">Paste a public github.com link. Cyberlens clones the repo, runs three engines on it and deletes the clone when it is done.</p>
        <NewScan />

        {running && (
          <p className="mt-8 text-muted">
            <span className="text-data">{SCAN_STATUS_TEXT[running.status]}</span> now: {repoName(running.repoUrl)}.{' '}
            <Link to={`/app/scans/${running.id}`} className="text-ink underline underline-offset-4">Watch it</Link>
          </p>
        )}

        <section aria-labelledby="engines" className="mt-16">
          <h2 id="engines" className="text-[22px] font-medium">What runs</h2>
          <dl className="mt-5 grid gap-4 md:grid-cols-3">
            {Object.entries(ENGINE_NAMES).map(([key, name]) => (
              <div key={key} className="rounded-lg border border-rule p-5">
                <dt className="text-[17px] font-medium">{name}</dt>
                <dd className="mt-2 text-muted">{ENGINE_TEXT[key]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-muted">Public repos up to 200 MB, one scan at a time.</p>
        </section>
      </div>
    </>
  );
}
