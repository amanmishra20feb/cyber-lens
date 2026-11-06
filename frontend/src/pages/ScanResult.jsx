import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { Findings } from '../components/FindingsTable.jsx';
import { PageTitle } from '../components/PageTitle.jsx';
import { RepoMap } from '../components/RepoMap.jsx';
import { Severity } from '../components/Severity.jsx';
import { ENGINE_NAMES, FINAL, SEVERITIES, STATUS_TEXT, duration, repoName } from '../format.js';

const STAGES = ['cloning', 'scanning', 'saving'];
const STAGE_TEXT = { cloning: 'Cloning the repo into a sandbox', scanning: 'Running Semgrep, Gitleaks and OSV-Scanner', saving: 'Saving findings' };

const ENGINE_ORDER = ['semgrep', 'gitleaks', 'osv'];

function EngineRow({ name, result, waiting }) {
  const state = result ? (result.ok ? `${result.count} finding${result.count === 1 ? '' : 's'} in ${(result.ms / 1000).toFixed(1)} s` : 'Failed') : waiting ? 'Waiting' : 'Running';
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden="true" className={`size-2.5 rounded-[3px] ${!result ? (waiting ? 'bg-control' : 'animate-pulse bg-data') : result.ok ? 'bg-ink' : 'bg-sev-critical'}`} />
      <span className="w-28">{ENGINE_NAMES[name]}</span>
      <span className={result?.ok === false ? 'text-sev-critical' : 'text-muted'}>{state}</span>
    </li>
  );
}

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
      {current >= 1 && (
        <ul className="mt-6 space-y-2 pl-5">
          {ENGINE_ORDER.map((name) => <EngineRow key={name} name={name} result={scan.engines.find((e) => e.name === name)} />)}
        </ul>
      )}
    </div>
  );
}

// The server sends the scan after every change; this keeps the cached copy current without polling.
// EventSource reconnects by itself and the server starts each connection with the latest scan.
function useScanStream(id, live) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!live) return;
    const stream = new EventSource(`/api/scans/${id}/events`);
    stream.onmessage = (e) => {
      const scan = JSON.parse(e.data);
      queryClient.setQueryData(['scan', id], (old) => ({ ...old, ...scan })); // keeps the Repo Map files the stream leaves out
      if (FINAL.includes(scan.status)) {
        stream.close();
        queryClient.invalidateQueries({ queryKey: ['scan', id] });
        queryClient.invalidateQueries({ queryKey: ['scans'] });
      }
    };
    return () => stream.close();
  }, [id, live, queryClient]);
}

export function ScanResultPage() {
  const { id } = useParams();
  const [file, setFile] = useState(null); // set by clicking a Repo Map tile, read by the findings table
  const scanQuery = useQuery({
    queryKey: ['scan', id],
    queryFn: () => api(`/scans/${id}`).then((d) => d.scan),
  });
  const scan = scanQuery.data;
  useScanStream(id, !!scan && !FINAL.includes(scan.status));
  const cancel = useMutation({ mutationFn: () => api(`/scans/${id}/cancel`, { method: 'POST' }) }); // the stream delivers the new status
  const findingsQuery = useQuery({
    queryKey: ['findings', id],
    queryFn: () => api(`/scans/${id}/findings`).then((d) => d.findings),
    enabled: scan?.status === 'done',
  });

  if (scanQuery.error) return <p role="alert" className="text-sev-critical">{scanQuery.error.message} <Link to="/app" className="text-ink underline">Back to scans</Link></p>;
  if (!scan) return <p className="text-muted">Loading scan…</p>;

  const failedEngines = scan.engines.filter((e) => !e.ok);
  const findings = findingsQuery.data;
  // Headline numbers are findings still open, so triage is reflected; scan.counts (all found) is used until the list loads.
  const counts = findings ? Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s && f.status === 'open').length])) : scan.counts;

  return (
    <>
      <PageTitle>{repoName(scan.repoUrl)}</PageTitle>
      <Link to="/app" className="text-muted hover:text-ink">Scans</Link>
      <h1 className="mt-2 text-[28px] font-medium break-all">
        <a href={scan.repoUrl} target="_blank" rel="noreferrer" className="hover:underline underline-offset-4">{repoName(scan.repoUrl)}</a>
      </h1>
      <p className="mt-1 text-muted">
        {[scan.branch ?? 'Default branch', scan.commit && `commit ${scan.commit.slice(0, 7)}`, STATUS_TEXT[scan.status], scan.finishedAt && scan.startedAt && `took ${duration(scan.startedAt, scan.finishedAt)}`].filter(Boolean).join(', ')}
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
          {scan.skipped?.count > 0 && (
            <div className="mt-4 rounded-xl bg-surface p-4">
              <p className="font-medium">{scan.skipped.count} large file{scan.skipped.count === 1 ? ' was' : 's were'} not scanned</p>
              <p className="mt-1 text-muted">This repo is over 200 MB, so it was scanned without files over 1 MB, usually videos, datasets and archives. Everything else was scanned.</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-muted hover:text-ink">Show files left out</summary>
                <ul className="mt-2 space-y-1 break-all text-[14px] text-muted">
                  {scan.skipped.paths.map((path) => <li key={path}>{path}</li>)}
                </ul>
                {scan.skipped.count > scan.skipped.paths.length && <p className="mt-2 text-[14px] text-muted">and {scan.skipped.count - scan.skipped.paths.length} more.</p>}
              </details>
            </div>
          )}
          {failedEngines.map((e) => (
            <p key={e.name} role="alert" className="mt-2 text-sev-high">
              {ENGINE_NAMES[e.name]} failed: {e.error}. Results from the other engines are shown.
            </p>
          ))}

          {findings && scan.files?.length > 0 && (
            <section className="mt-12" aria-labelledby="map">
              <h2 id="map" className="mb-4 text-[22px] font-medium">Repo map</h2>
              <RepoMap files={scan.files} fileCount={scan.fileCount} findings={findings} selected={file} onSelect={setFile} />
            </section>
          )}

          <section className="mt-12" aria-labelledby="findings">
            <h2 id="findings" className="text-[22px] font-medium">Findings</h2>
            {findingsQuery.isPending && <p className="mt-4 text-muted">Loading findings…</p>}
            {findingsQuery.error && <p role="alert" className="mt-4 text-sev-critical">{findingsQuery.error.message}</p>}
            {findings?.length === 0 && (
              <p className="mt-4 text-muted">No findings. Cyberlens ran {scan.engines.filter((e) => e.ok).length} engines on {scan.fileCount} files and found nothing to report.</p>
            )}
            {findings?.length > 0 && <Findings findings={findings} file={file} onFile={setFile} />}
          </section>
        </>
      )}
    </>
  );
}
