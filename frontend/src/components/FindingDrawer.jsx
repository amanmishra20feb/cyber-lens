import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { ENGINE_NAMES, IGNORE_REASON_TEXT, OWASP_2025, STATUS_LABEL } from '../format.js';
import { Severity } from './Severity.jsx';

function Snippet({ finding }) {
  const first = finding.snippetLine ?? finding.line;
  const last = finding.endLine ?? finding.line;
  return (
    <pre className="mt-4 overflow-x-auto rounded-lg bg-raised py-2 font-mono text-[14px] leading-6">
      {finding.snippet.split('\n').map((text, i) => {
        const n = first + i;
        const hit = n >= finding.line && n <= last;
        return (
          <div key={n} className={`flex ${hit ? 'bg-control' : ''}`}>
            <span className="num w-12 shrink-0 select-none pr-3 text-right text-muted">{n}</span>
            <code className={hit ? 'text-ink' : 'text-muted'}>{text || ' '}</code>
          </div>
        );
      })}
    </pre>
  );
}

// Finding details and triage in a native <dialog>, which handles focus, Esc and focus return.
// Text from the repo is only ever rendered as plain text.
export function FindingDrawer({ finding: f, onClose }) {
  const dialog = useRef(null);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const leaving = useRef();
  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
    return () => clearTimeout(leaving.current);
  }, []);

  const triage = useMutation({
    mutationFn: (body) => api(`/findings/${f.id}`, { method: 'PATCH', body }),
    onSuccess: ({ finding }) => queryClient.setQueryData(['findings', f.scanId], (list) => list?.map((x) => (x.id === finding.id ? finding : x))),
  });
  const set = (status, ignoreReason) => triage.mutate({ status, ignoreReason });
  const close = () => dialog.current.close();
  const button = 'h-9 rounded-lg px-4 font-medium hover:opacity-80 disabled:opacity-60';

  return (
    <dialog
      ref={dialog}
      onClose={() => { leaving.current = setTimeout(onClose, 150); }} // wait for the slide-out
      onClick={(e) => e.target === dialog.current && close()} // a click on the backdrop closes it
      aria-labelledby="finding-title"
      className="drawer m-0 ml-auto h-dvh max-h-none w-full max-w-[600px] bg-bg p-0 text-ink backdrop:bg-black/40 md:border-l md:border-rule"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="finding-title" className="text-[22px] font-medium">{f.title}</h2>
          <button type="button" onClick={close} className={`${button} shrink-0 bg-control`}>Close</button>
        </div>
        <p className="mt-3 text-muted"><Severity level={f.severity} /></p>
        <p className="mt-1 break-all text-muted">{f.file}{f.line ? `:${f.line}` : ''}</p>
        <p className="mt-4 max-w-[72ch]">{f.message}</p>
        {f.snippet && <Snippet finding={f} />}
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-muted">
          <div><dt className="inline">Found by </dt><dd className="inline text-ink">{f.engines.map((e) => ENGINE_NAMES[e]).join(' and ')}</dd></div>
          <div><dt className="inline">Rule </dt><dd className="inline break-all text-ink">{f.ruleId}</dd></div>
          {f.cwe.map((c) => (
            <a key={c} href={`https://cwe.mitre.org/data/definitions/${c.slice(4)}.html`} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">{c}</a>
          ))}
          {f.owasp.map((o) => <span key={o} className="text-ink">{o}:2025 {OWASP_2025[o]}</span>)}
        </dl>

        <section aria-labelledby="triage" className="mt-8 border-t border-rule pt-6">
          <h3 id="triage" className="font-medium">Triage</h3>
          <p className="mt-1 text-muted" aria-live="polite">
            {STATUS_LABEL[f.status]}{f.status === 'ignored' && `: ${IGNORE_REASON_TEXT[f.ignoreReason]}`}
          </p>
          {f.status === 'open' ? (
            <div className="mt-4 space-y-4">
              <button type="button" onClick={() => set('fixed')} disabled={triage.isPending} className={`${button} bg-ink text-bg`}>Mark as fixed</button>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="ignore-reason" className="text-muted">Or ignore because</label>
                <select id="ignore-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-lg border border-rule bg-surface px-3 text-[15px]">
                  <option value="">Choose a reason</option>
                  {Object.entries(IGNORE_REASON_TEXT).map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                </select>
                <button type="button" onClick={() => set('ignored', reason)} disabled={!reason || triage.isPending} className={`${button} bg-control`}>Ignore</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => set('open')} disabled={triage.isPending} className={`${button} mt-4 bg-control`}>Reopen</button>
          )}
          {triage.error && <p role="alert" className="mt-3 text-sev-critical">{triage.error.message}</p>}
        </section>
      </div>
    </dialog>
  );
}
