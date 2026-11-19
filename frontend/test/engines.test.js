import test from 'node:test';
import assert from 'node:assert/strict';
import { engineStates } from '../src/format.js';

const states = (finished, oneAtATime) => engineStates(finished, oneAtATime).map((e) => e.state);

test('engineStates: engines in parallel all run until they report', () => {
  assert.deepEqual(states([], false), ['running', 'running', 'running']);
  assert.deepEqual(states([{ name: 'gitleaks', ok: true, count: 3, ms: 10 }], false), ['running', 'done', 'running']);
});

test('engineStates: one at a time, only the next engine runs and a failure still moves on', () => {
  assert.deepEqual(states([], true), ['running', 'waiting', 'waiting']);
  assert.deepEqual(states([{ name: 'semgrep', ok: false, error: 'x', ms: 10 }], true), ['failed', 'running', 'waiting']);
});
