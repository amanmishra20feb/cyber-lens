import { useMemo, useRef, useState } from 'react';
import { SEVERITIES } from '../format.js';
import { FILL, Severity } from './Severity.jsx';
import { fileStats, lensSummary, squarify, tileWeight } from './repoMapLayout.js';

const W = 100, H = 56; // layout units; the box keeps this aspect ratio, so units are square on screen
// outside the lens the colour stays visible but quiet, so nobody has to hunt for findings
const TINT = { critical: 'bg-sev-critical/35', high: 'bg-sev-high/35', medium: 'bg-sev-medium/35', low: 'bg-sev-low/35' };
const LENS_RADIUS = 17; // layout units: the lens covers about a sixth of the map
const LENS_ZOOM = 1.25;
const baseName = (path) => path.slice(path.lastIndexOf('/') + 1);
const centre = (t) => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 });
const boxOf = (t) => ({ left: `${(t.x / W) * 100}%`, top: `${(t.y / H) * 100}%`, width: `${(t.w / W) * 100}%`, height: `${(t.h / H) * 100}%` });
const plural = (n) => `${n} open finding${n === 1 ? '' : 's'}`;

// One tile per file: size from its line count, colour from its worst open finding.
// Only tiles with findings are buttons, and the map is a single tab stop (arrow keys move inside it).
// TODO: tiles get tiny on phones; the findings table below covers the same thing for now.
export function RepoMap({ files, fileCount, findings, selected, onSelect }) {
  const [active, setActive] = useState(null);
  const [lens, setLens] = useState(null);
  const map = useRef(null);
  const parts = useRef(null);
  const shown = useRef(null);
  // the layout only depends on the files, so triage just recolours tiles
  const layout = useMemo(
    () => squarify([...files].sort((a, b) => b.loc - a.loc || a.path.localeCompare(b.path)).map((f) => ({ path: f.path, loc: f.loc, weight: tileWeight(f.loc) })), W, H),
    [files],
  );
  const stats = useMemo(() => new Map(fileStats(files, findings).map((s) => [s.path, s])), [files, findings]);
  const tiles = useMemo(() => layout.map((t) => ({ ...t, ...stats.get(t.path) })), [layout, stats]);
  const hot = tiles.filter((t) => t.count > 0);
  // touch screens cannot hover, so there the lens stays visible and starts on the worst file
  const worst = [...hot].sort((a, b) => SEVERITIES.indexOf(a.worst) - SEVERITIES.indexOf(b.worst) || b.count - a.count)[0];
  const at = lens ?? (worst ? centre(worst) : { x: W / 2, y: H / 2 });
  const pos = { '--x': at.x, '--y': at.y };
  const inLens = lensSummary(tiles, at.x, at.y, LENS_RADIUS / LENS_ZOOM);
  shown.current = inLens;
  const tabbable = hot.some((t) => t.path === active) ? active : hot.some((t) => t.path === selected) ? selected : hot[0]?.path;

  const mapped = new Set(files.map((f) => f.path));
  const unmapped = findings.filter((f) => f.status === 'open' && !mapped.has(f.file)).length;

  // moves every frame through CSS variables on the lens parts alone, so the tiles are not restyled; React only hears about it when the summary changes
  const aim = (x, y) => {
    parts.current ??= map.current.querySelectorAll('.lens, .lens-zoom, .lens-ring, .lens-dot');
    for (const part of parts.current) {
      part.style.setProperty('--x', x);
      part.style.setProperty('--y', y);
    }
    const next = lensSummary(tiles, x, y, LENS_RADIUS / LENS_ZOOM);
    const now = shown.current;
    if (next.under !== now.under || next.files !== now.files || next.findings !== now.findings) setLens({ x, y });
  };
  const follow = (e) => {
    const box = map.current.getBoundingClientRect();
    const scale = W / box.width;
    // kept on the map, so on a fast exit the lens closes at the edge the cursor crossed
    aim(Math.min(W, Math.max(0, (e.clientX - box.left) * scale)), Math.min(H, Math.max(0, (e.clientY - box.top) * scale)));
  };

  const move = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    const buttons = [...e.currentTarget.querySelectorAll('[data-tile]')];
    const next = buttons[buttons.indexOf(document.activeElement) + step];
    if (next) { e.preventDefault(); next.focus(); }
  };

  // kept between renders, so the lens crossing a tile does not re-render every tile
  const baseTiles = useMemo(
    () => tiles.map((t) => {
          const box = boxOf(t);
          if (t.count === 0) return <div key={t.path} aria-hidden="true" style={box} className="absolute p-[1.5px]"><div className="tile h-full w-full bg-control" /></div>;
          const on = selected === t.path;
          return (
            <div key={t.path} style={box} className="absolute p-[1.5px]">
              <button
                type="button"
                data-tile
                tabIndex={t.path === tabbable ? 0 : -1}
                aria-pressed={on}
                aria-label={`${t.path}: ${plural(t.count)}, worst ${t.worst}`}
                onFocus={(e) => {
                  setActive(t.path);
                  if (e.target.matches(':focus-visible')) aim(centre(t).x, centre(t).y);
                }}
                onClick={() => onSelect(on ? null : t.path)}
                className={`tile flex h-full w-full flex-col items-start overflow-hidden p-1.5 text-left text-[12px] leading-tight focus-visible:outline-offset-[-2px] ${on ? `${FILL[t.worst]} text-bg outline outline-2 -outline-offset-2 outline-ink` : `${TINT[t.worst]} text-ink`}`}
              >
                {t.w >= 5 && t.h >= 5 && <span className="num font-medium">{t.count}</span>}
                {t.w >= 16 && t.h >= 8 && <span className="block w-full truncate">{baseName(t.path)}</span>}
              </button>
            </div>
          );
        }),
    [tiles, selected, tabbable, onSelect],
  );
  const zoomTiles = useMemo(
    () => tiles.map((t) => (
      <div key={t.path} style={boxOf(t)} className="absolute p-[1.5px]">
        <div className={`tile h-full w-full overflow-hidden px-1.5 py-1 text-[12px] leading-tight ${t.count ? `${FILL[t.worst]} text-bg` : 'bg-control text-muted'}`}>
          {t.w >= 7 && t.h >= 3.5 && <span className="block truncate">{t.count > 0 && <span className="num font-medium">{t.count} </span>}{baseName(t.path)}</span>}
        </div>
      </div>
    )),
    [tiles],
  );

  return (
    <>
      <div role="group" aria-label="Repo map: one tile per file, coloured by its worst open finding" ref={map} onKeyDown={move} onPointerMove={follow} onPointerDown={follow} onPointerLeave={follow} className="lens-map relative w-full overflow-hidden rounded-xl bg-surface" style={{ aspectRatio: `${W} / ${H}`, '--r': `${LENS_RADIUS}cqw`, '--zoom': LENS_ZOOM }}>
        {baseTiles}
        <div aria-hidden="true" className="lens" style={pos}>
          <div className="lens-zoom" style={pos}>{zoomTiles}</div>
        </div>
        <div aria-hidden="true" className="lens-ring" style={pos} />
        <div aria-hidden="true" className="lens-dot" style={{ ...pos, '--dot': inLens.worst ? `var(--sev-${inLens.worst})` : 'var(--control)' }} />
      </div>
      {/* two lines reserved, so the legend below does not jump as the text changes */}
      <p className="lens-info mt-3 flex min-h-11 flex-wrap content-start items-center gap-x-3 text-muted">
        <span className="lens-rest">
          {hot.length ? `${hot.length} of ${tiles.length} files ${hot.length === 1 ? 'has' : 'have'} open findings. Point at the map to look closer.` : 'No open findings on this map.'}
        </span>
        <span className="lens-live">
          {inLens.under && <span className="min-w-0 break-all font-medium text-ink">{inLens.under}</span>}
          {inLens.worst ? <span>{plural(inLens.count)}, worst <Severity level={inLens.worst} /></span> : inLens.under && <span>No open findings</span>}
          <span>In the lens: {inLens.files} file{inLens.files === 1 ? '' : 's'}, {plural(inLens.findings)}</span>
        </span>
      </p>
      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-muted" aria-label="Tile colours">
        {SEVERITIES.map((s) => <li key={s}><Severity level={s} /></li>)}
        <li className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-[3px] bg-control" />No open findings</li>
      </ul>
      <p className="mt-2 max-w-[72ch] text-[14px] text-muted">
        Tile area follows the square root of a file's lines, so one huge file such as a lockfile cannot hide the rest. The dot marks the tile you are on. Select it to show only that file's findings.
        {fileCount > files.length && ` ${fileCount - files.length} of ${fileCount} files are not drawn: binary files, files over 1 MB, or beyond the largest 1,500.`}
        {unmapped > 0 && ` ${unmapped} open finding${unmapped === 1 ? ' is' : 's are'} in files not drawn here; the table lists them.`}
      </p>
    </>
  );
}
