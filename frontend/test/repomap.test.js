import test from 'node:test';
import assert from 'node:assert/strict';
import { fileStats, squarify, tileWeight } from '../src/components/repoMapLayout.js';

const EPS = 1e-6;

test('squarify: tiles stay inside the box, never overlap, and fill it in proportion to weight', () => {
  const weights = Array.from({ length: 60 }, (_, i) => 60 - i + (i % 7)).sort((a, b) => b - a); // deterministic, uneven, largest first
  const items = weights.map((weight, i) => ({ id: i, weight }));
  const [W, H] = [100, 36];
  const tiles = squarify(items, W, H);

  assert.equal(tiles.length, items.length);
  const total = weights.reduce((a, b) => a + b, 0);
  for (const t of tiles) {
    assert.ok(t.x >= -EPS && t.y >= -EPS && t.x + t.w <= W + EPS && t.y + t.h <= H + EPS, `tile ${t.id} leaves the box`);
    assert.ok(Math.abs(t.w * t.h - (t.weight / total) * W * H) < EPS, `tile ${t.id} has the wrong area`);
  }
  assert.ok(Math.abs(tiles.reduce((s, t) => s + t.w * t.h, 0) - W * H) < EPS); // no gaps
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i], b = tiles[j];
      const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert.ok(overlapW <= EPS || overlapH <= EPS, `tiles ${a.id} and ${b.id} overlap`);
    }
  }
});

test('squarify: empty input gives no tiles and one item fills the box', () => {
  assert.deepEqual(squarify([], 100, 36), []);
  const [only] = squarify([{ id: 'a', weight: 5 }], 100, 36);
  assert.deepEqual([only.x, only.y, only.w, only.h], [0, 0, 100, 36]);
});

test('tileWeight: a huge file is larger but cannot swamp the map, and empty files still get a tile', () => {
  assert.equal(tileWeight(0), 1);
  assert.ok(tileWeight(27515) / tileWeight(54) < 25); // 509x the lines, about 23x the weight
});

test('fileStats: counts only open findings, picks the worst severity, ignores files not on the map', () => {
  const files = [{ path: 'a.js', loc: 10 }, { path: 'b.js', loc: 20 }, { path: 'c.js', loc: 30 }];
  const finding = (file, severity, status = 'open') => ({ file, severity, status });
  const stats = fileStats(files, [
    finding('a.js', 'low'), finding('a.js', 'high'), finding('a.js', 'medium'),
    finding('b.js', 'critical', 'fixed'), finding('b.js', 'critical', 'ignored'), // triaged away: b.js has nothing open
    finding('elsewhere.js', 'critical'), // not a mapped file
  ]);
  assert.deepEqual(stats, [
    { path: 'a.js', loc: 10, count: 3, worst: 'high' },
    { path: 'b.js', loc: 20, count: 0, worst: null },
    { path: 'c.js', loc: 30, count: 0, worst: null },
  ]);
});
