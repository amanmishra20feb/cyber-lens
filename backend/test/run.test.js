import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { run } from '../src/scanner/run.js';

// "[s]leep" matches "sleep" but not the shell running pgrep, whose own command line contains the pattern text
const alive = (pattern) => { try { execSync(`pgrep -f "[${pattern[0]}]${pattern.slice(1)}"`); return true; } catch { return false; } };

test('run returns output and exit code, and reports a missing program instead of throwing', async () => {
  const ok = await run('sh', ['-c', 'echo hi; exit 3']);
  assert.deepEqual([ok.code, ok.stdout.trim()], [3, 'hi']);
  const missing = await run('cyberlens-no-such-program', []);
  assert.equal(missing.code, -1);
  assert.match(missing.stderr, /not installed/);
});

test('a timeout kills the program and its children', async () => {
  const res = await run('sh', ['-c', 'sleep 41 & wait'], { timeout: 200 });
  assert.equal(res.code, -1);
  assert.match(res.stderr, /timed out/);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(alive('sleep 41'), false);
});

test('aborting kills the program and its children, even when already aborted', async () => {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 200);
  const started = Date.now();
  const res = await run('sh', ['-c', 'sleep 43 & wait'], { signal: ctrl.signal });
  assert.deepEqual([res.code, res.stderr], [-1, 'cancelled']);
  assert.ok(Date.now() - started < 3000);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(alive('sleep 43'), false);
  assert.equal((await run('sh', ['-c', 'sleep 47'], { signal: AbortSignal.abort() })).stderr, 'cancelled');
});
