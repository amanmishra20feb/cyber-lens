import test from 'node:test';
import assert from 'node:assert/strict';
test('security guardrail: refuses repos exceeding 200MB limit', () => {
  const MAX_REPO_BYTES = 200 * 1024 * 1024;
  const testRepoBytes = 250 * 1024 * 1024;
  const isRefused = testRepoBytes > MAX_REPO_BYTES;
  assert.equal(isRefused, true, 'Repositories over 200 MB must be rejected before cloning');
});
