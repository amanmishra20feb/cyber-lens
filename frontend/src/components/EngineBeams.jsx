import { ENGINE_NAMES, engineStates } from '../format.js';

const ROW = 88, GAP = 12; // one engine card and the space below it, in px
const HEIGHT = ROW * 3 + GAP * 2;
const wire = (i) => {
  const y = ROW / 2 + i * (ROW + GAP);
  return `M 0 ${y} C 60 ${y}, 60 ${HEIGHT / 2}, 120 ${HEIGHT / 2}`;
};
const DOT = { waiting: 'bg-control', running: 'animate-pulse bg-data', done: 'bg-ink', failed: 'bg-sev-critical' };

function stateText(e) {
  if (e.state === 'done') return `${e.count} finding${e.count === 1 ? '' : 's'} in ${(e.ms / 1000).toFixed(1)} s`;
  return { waiting: 'Waiting', running: 'Running', failed: 'Failed' }[e.state];
}

// Only real events move this: a wire flows while its engine runs and thickens with its real count at the end.
export function EngineBeams({ finished, oneAtATime }) {
  const engines = engineStates(finished, oneAtATime);
  const reported = finished.reduce((sum, e) => sum + (e.count ?? 0), 0);
  return (
    <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]">
      <ul className="space-y-3">
        {engines.map((e) => (
          <li key={e.name} className="flex h-22 flex-col justify-center rounded-xl bg-surface px-3">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-[3px] ${DOT[e.state]}`} />
              {ENGINE_NAMES[e.name]}
            </span>
            <span className={`mt-0.5 text-[14px] ${e.state === 'failed' ? 'text-sev-critical' : 'text-muted'}`}>{stateText(e)}</span>
          </li>
        ))}
      </ul>
      <svg aria-hidden="true" viewBox={`0 0 120 ${HEIGHT}`} preserveAspectRatio="none" className="w-full" style={{ height: HEIGHT }}>
        {engines.map((e, i) => (
          <g key={e.name}>
            <path d={wire(i)} className="beam" data-state={e.state} style={{ strokeWidth: e.state === 'done' ? 1.5 + Math.sqrt(e.count) / 2.2 : 1.5 }} />
            <path d={wire(i)} pathLength="100" className="beam-flow" style={{ opacity: e.state === 'running' ? 1 : 0, animationPlayState: e.state === 'running' ? 'running' : 'paused', animationDelay: `${-i * 0.5}s` }} />
          </g>
        ))}
      </svg>
      <div className="flex flex-col justify-center self-center rounded-xl bg-surface px-3 py-4">
        <span className="text-[14px] text-muted">Reported so far</span>
        <span key={reported} className="page-in num mt-1 text-[28px]">{reported}</span>
        <span className="mt-1 text-[14px] text-muted">{finished.length} of {engines.length} engines finished</span>
      </div>
    </div>
  );
}
