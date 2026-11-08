import { SEVERITIES } from '../format.js';

// Repo map maths without React, so it can be tested on its own.

// sqrt, so one huge file (a lockfile can be most of a repo) doesn't squeeze out everything else
export const tileWeight = (loc) => Math.sqrt(Math.max(loc, 1));

// One entry per file: {path, loc, count, worst}, counting open findings only.
export function fileStats(files, findings) {
  const open = new Map();
  for (const f of findings) {
    if (f.status !== 'open') continue;
    const entry = open.get(f.file) ?? { count: 0, worst: null };
    entry.count++;
    if (entry.worst === null || SEVERITIES.indexOf(f.severity) < SEVERITIES.indexOf(entry.worst)) entry.worst = f.severity;
    open.set(f.file, entry);
  }
  return files.map(({ path, loc }) => ({ path, loc, count: open.get(path)?.count ?? 0, worst: open.get(path)?.worst ?? null }));
}

// Squarified treemap (Bruls, Huizing & van Wijk). Items must be sorted largest first.
// Gives each item x, y, w, h with its area proportional to its weight.
export function squarify(items, width, height) {
  if (items.length === 0) return [];
  const scale = (width * height) / items.reduce((sum, i) => sum + i.weight, 0);
  const out = [];
  let x = 0, y = 0, w = width, h = height;
  let row = [];
  const sum = (r) => r.reduce((s, n) => s + n.area, 0);
  // worst aspect ratio if these items share one side; lower is squarer
  const worst = (r, side) => {
    const s = sum(r);
    return Math.max((side * side * Math.max(...r.map((n) => n.area))) / (s * s), (s * s) / (side * side * Math.min(...r.map((n) => n.area))));
  };
  const place = (r) => {
    const s = sum(r);
    if (w >= h) { // a column down the left edge
      const colW = s / h;
      let cy = y;
      for (const n of r) { out.push({ ...n, x, y: cy, w: colW, h: n.area / colW }); cy += n.area / colW; }
      x += colW; w -= colW;
    } else { // a row along the top edge
      const rowH = s / w;
      let cx = x;
      for (const n of r) { out.push({ ...n, x: cx, y, w: n.area / rowH, h: rowH }); cx += n.area / rowH; }
      y += rowH; h -= rowH;
    }
  };
  for (const item of items) {
    const node = { ...item, area: item.weight * scale };
    const side = Math.min(w, h);
    if (row.length === 0 || worst([...row, node], side) <= worst(row, side)) row.push(node);
    else { place(row); row = [node]; }
  }
  place(row);
  return out.map(({ area, ...tile }) => tile);
}
