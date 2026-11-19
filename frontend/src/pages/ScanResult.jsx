import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { EngineBeams } from '../components/EngineBeams.jsx';
import { Findings } from '../components/FindingsTable.jsx';
import { PageTitle } from '../components/PageTitle.jsx';
import { RepoMap } from '../components/RepoMap.jsx';
import { Severity } from '../components/Severity.jsx';
import { ENGINE_NAMES, FINAL, SEVERITIES, SCAN_STATUS_TEXT, duration, repoName } from '../format.js';

const STAGES = ['cloning', 'scanning', 'saving'];
const STAGE_TEXT = { cloning: 'Cloning the repo into a sandbox', scanning: 'Running Semgrep, Gitleaks and OSV-Scanner', saving: 'Saving findings' };

function Progress({ scan }) {
  const current = STAGES.indexOf(scan.status);
  return (
    <div className="mt-8" aria-live="polite">
      <ol className="space-y-3">
        {STAGES.map((stage, i) => (
          <li key={stage} className={`flex items-center gap-3 ${i === current ? 'text-ink' : 'text-muted'}`}>
            <span aria-hidden="true" className={`size-2.5 rounded-[3px] ${i < current ? 'bg-ink' : i === current ? 'animate-pulse bg-data' : 'bg-control'}`} />
            {STAGE_TEXT[stage]}
            {i < current && <span className="sr-only">(done)</span>}
            {i === current && <span className="sr-only">(in progress)</span>}
          </li>
        ))}
      </ol>
      {current >= 1 && <div className="mt-6"><EngineBeams finished={scan.engines} oneAtATime={scan.oneAtATime} /></div>}
    </div>
  );
}

// Asks once before deleting; "Cancel" takes focus, so pressing Enter twice does not delete.
function DeleteScan({ id }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/scans/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      navigate('/app', { replace: true });
    },
  });
  const button = 'h-9 rounded-lg px-4 font-medium hover:opacity-80 disabled:opacity-60';

  if (!asking) return <button type="button" onClick={() => setAsking(true)} className={`${button} bg-control`}>Delete scan</button>;
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>Delete this scan and all its findings? This cannot be undone.</span>
        <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending} className={`${button} bg-sev-critical text-bg`}>{remove.isPending ? 'Deleting…' : 'Delete'}</button>
        <button type="button" autoFocus onClick={() => setAsking(false)} disabled={remove.isPending} className={`${button} bg-control`}>Cancel</button>
      </p>
      {remove.error && <p role="alert" className="mt-2 text-sev-critical">{remove.error.message}</p>}
    </div>
  );
}

export function ScanResultPage() {
  const { id } = useParams();
  const [file, setFile] = useState(null); // picked on the repo map, filters the findings table
  const scanQuery = useQuery({
    queryKey: ['scan', id],
    queryFn: () => api(`/scans/${id}`).then((d) => d.scan),
    // asks again every 2 s until the scan finishes
    refetchInterval: (q) => (q.state.data && !FINAL.includes(q.state.data.status) ? 2000 : false),
  });
  const scan = scanQuery.data;
  const cancel = useMutation({ mutationFn: () => api(`/scans/${id}/cancel`, { method: 'POST' }) }); // the new status arrives through the stream
  const findingsQuery = useQuery({
    queryKey: ['findings', id],
    queryFn: () => api(`/scans/${id}/findings`).then((d) => d.findings),
    enabled: scan?.status === 'done',
  });

  if (scanQuery.error) return <p role="alert" className="text-sev-critical">{scanQuery.error.message} <Link to="/app" className="text-ink underline">Back to scans</Link></p>;
  if (!scan) return <p className="text-muted">Loading scan…</p>;

  const failedEngines = scan.engines.filter((e) => !e.ok);
  const findings = findingsQuery.data;
  // count open findings so triage shows up; fall back to scan.counts until the list loads
  const counts = findings ? Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s && f.status === 'open').length])) : scan.counts;

  return (
    <>
      <PageTitle>{repoName(scan.repoUrl)}</PageTitle>
      <Link to="/app" className="text-muted hover:text-ink">Scans</Link>
      <h1 className="mt-2 text-[28px] font-medium break-all">
        <a href={scan.repoUrl} target="_blank" rel="noreferrer" className="hover:underline underline-offset-4">{repoName(scan.repoUrl)}</a>
      </h1>
      <p className="mt-1 text-muted">
        {[scan.branch ?? 'Default branch', scan.commit && `commit ${scan.commit.slice(0, 7)}`, SCAN_STATUS_TEXT[scan.status], scan.finishedAt && scan.startedAt && `took ${duration(scan.startedAt, scan.finishedAt)}`].filter(Boolean).join(', ')}
      </p>

      {!FINAL.includes(scan.status) && (
        <>
          <Progress scan={scan} />
          <button type="button" onClick={() => cancel.mutate()} disabled={cancel.isPending} className="mt-8 h-9 rounded-lg bg-control px-4 font-medium hover:opacity-80 disabled:opacity-60">
            {cancel.isPending ? 'Cancelling…' : 'Cancel scan'}
          </button>
          {cancel.error && <p role="alert" className="mt-3 text-sev-critical">{cancel.error.message}</p>}
        </>
      )}
      {scan.status === 'cancelled' && <p className="mt-8 text-muted">Scan cancelled. Nothing was saved. <Link to="/app" className="text-ink underline underline-offset-4">Start another scan</Link></p>}
      {scan.status === 'failed' && <p role="alert" className="mt-8 text-sev-critical">{scan.error}</p>}

      {scan.status === 'done' && (
        <>
          <p className="mt-8 text-muted">Open findings by severity</p>
          <dl className="mt-3 flex flex-wrap gap-x-12 gap-y-4">
            {SEVERITIES.map((s) => (
              <div key={s}>
                <dt className="text-muted"><Severity level={s} /></dt>
                <dd className={`num mt-1 text-[28px] ${counts[s] ? '' : 'text-muted'}`}>{counts[s]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[14px] text-muted">
            {scan.engines.filter((e) => e.ok).map((e) => `${ENGINE_NAMES[e.name]} ${e.count}`).join(', ')} findings before merging, across {scan.fileCount} files.
          </p>
          {failedEngines.map((e) => (
            <p key={e.name} role="alert" className="mt-2 text-sev-high">
              {ENGINE_NAMES[e.name]} failed: {e.error}. Results from the other engines are shown.
            </p>
          ))}

          {/* both sections wait for the list, so the map never appears above the table and pushes it down */}
          {findingsQuery.isPending && <p className="mt-12 text-muted">Loading findings…</p>}
          {findingsQuery.error && <p role="alert" className="mt-12 text-sev-critical">{findingsQuery.error.message}</p>}
          {findings && scan.files?.length > 0 && (
            <section className="reveal mt-12" aria-labelledby="map">
              <h2 id="map" className="mb-4 text-[22px] font-medium">Repo map</h2>
              <RepoMap files={scan.files} fileCount={scan.fileCount} findings={findings} selected={file} onSelect={setFile} />
            </section>
          )}

          {findings && (
            <section className="reveal mt-12" aria-labelledby="findings">
              <h2 id="findings" className="text-[22px] font-medium">Findings</h2>
              {findings.length === 0 && (
                <p className="mt-4 text-muted">No findings. Cyberlens ran {scan.engines.filter((e) => e.ok).length} engines on {scan.fileCount} files and found nothing to report.</p>
              )}
              {findings.length > 0 && <Findings findings={findings} file={file} onFile={setFile} />}
            </section>
          )}
        </>
      )}

      {FINAL.includes(scan.status) && (
        <div className="mt-12 border-t border-rule pt-6">
          <DeleteScan id={scan.id} />
        </div>
      )}
    </>
  );
}
