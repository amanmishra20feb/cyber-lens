import { useMemo, useState } from 'react';
import { SEVERITIES } from '../format.js';
import { Severity } from './Severity.jsx';
import { fileStats, squarify, tileWeight } from './repoMapLayout.js';

const W = 100, H = 36; // layout units; the box keeps this aspect ratio, so units are square on screen
const FILL = { critical: 'bg-sev-critical', high: 'bg-sev-high', medium: 'bg-sev-medium', low: 'bg-sev-low' };
const baseName = (path) => path.slice(path.lastIndexOf('/') + 1);
const plural = (n) => `${n} open finding${n === 1 ? '' : 's'}`;

// One tile per file: size from its line count, colour from its worst open finding.
// Only tiles with findings are buttons, and the map is a single tab stop (arrow keys move inside it).
// TODO: tiles get tiny on phones; the findings table below covers the same thing for now.
export function RepoMap({ files, fileCount, findings, selected, onSelect }) {
  const [active, setActive] = useState(null);
  // the layout only depends on the files, so triage just recolours tiles
  const layout = useMemo(
    () => squarify([...files].sort((a, b) => b.loc - a.loc || a.path.localeCompare(b.path)).map((f) => ({ path: f.path, loc: f.loc, weight: tileWeight(f.loc) })), W, H),
    [files],
  );
  const stats = useMemo(() => new Map(fileStats(files, findings).map((s) => [s.path, s])), [files, findings]);
  const tiles = layout.map((t) => ({ ...t, ...stats.get(t.path) }));
  const hot = tiles.filter((t) => t.count > 0);
  const tabbable = hot.some((t) => t.path === active) ? active : hot.some((t) => t.path === selected) ? selected : hot[0]?.path;

  const mapped = new Set(files.map((f) => f.path));
  const unmapped = findings.filter((f) => f.status === 'open' && !mapped.has(f.file)).length;

  const move = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    const buttons = [...e.currentTarget.querySelectorAll('[data-tile]')];
    const next = buttons[buttons.indexOf(document.activeElement) + step];
    if (next) { e.preventDefault(); next.focus(); }
  };

  return (
    <>
      <div role="group" aria-label="Repo map: one tile per file, coloured by its worst open finding" onKeyDown={move} className="relative w-full overflow-hidden rounded-xl bg-surface" style={{ aspectRatio: `${W} / ${H}` }}>
        {tiles.map((t) => {
          const box = { left: `${(t.x / W) * 100}%`, top: `${(t.y / H) * 100}%`, width: `${(t.w / W) * 100}%`, height: `${(t.h / H) * 100}%` };
          const dim = selected && selected !== t.path ? 'opacity-35' : '';
          if (t.count === 0) return <div key={t.path} aria-hidden="true" title={`${t.path}: ${t.loc} lines`} style={box} className={`absolute p-px transition-opacity ${dim}`}><div className="h-full w-full bg-control" /></div>;
          return (
            <div key={t.path} style={box} className={`absolute p-px transition-opacity ${dim}`}>
              <button
                type="button"
                data-tile
                tabIndex={t.path === tabbable ? 0 : -1}
                aria-pressed={selected === t.path}
                aria-label={`${t.path}: ${plural(t.count)}, worst ${t.worst}`}
                title={`${t.path}: ${plural(t.count)}, worst ${t.worst}`}
                onFocus={() => setActive(t.path)}
                onClick={() => onSelect(selected === t.path ? null : t.path)}
                className={`flex h-full w-full flex-col items-start overflow-hidden p-1.5 text-left text-[12px] leading-tight text-bg hover:opacity-85 focus-visible:outline-offset-[-2px] ${FILL[t.worst]} ${selected === t.path ? 'outline outline-2 -outline-offset-2 outline-ink' : ''}`}
              >
                {t.w >= 5 && t.h >= 5 && <span className="num font-medium">{t.count}</span>}
                {t.w >= 16 && t.h >= 8 && <span className="block w-full truncate">{baseName(t.path)}</span>}
              </button>
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-muted" aria-label="Tile colours">
        {SEVERITIES.map((s) => <li key={s}><Severity level={s} /></li>)}
        <li className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-[3px] bg-control" />No open findings</li>
      </ul>
      <p className="mt-2 max-w-[72ch] text-[14px] text-muted">
        Tile area follows the square root of a file's lines, so one huge file such as a lockfile cannot hide the rest. Select a tile to show only that file's findings.
        {fileCount > files.length && ` ${fileCount - files.length} of ${fileCount} files are not drawn: binary files, files over 1 MB, or beyond the largest 1,500.`}
        {unmapped > 0 && ` ${unmapped} open finding${unmapped === 1 ? ' is' : 's are'} in files not drawn here; the table lists them.`}
      </p>
    </>
  );
}
