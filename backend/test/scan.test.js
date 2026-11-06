import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { partialClone } from '../src/scanner/scan.js';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, stdio: 'pipe' });

test('partialClone checks out small files, leaves out files over 1 MB, and names them', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cl-partial-'));
  try {
    const origin = path.join(root, 'origin');
    await fs.mkdir(path.join(origin, 'src'), { recursive: true });
    await fs.writeFile(path.join(origin, 'src', 'app.js'), 'console.log(1)\n');
    await fs.writeFile(path.join(origin, 'odd name.txt'), 'spaces are fine\n');
    await fs.writeFile(path.join(origin, 'video.mp4'), Buffer.alloc(2_000_000, 7));
    git(origin, 'init', '-q', '-b', 'main');
    git(origin, 'config', 'uploadpack.allowFilter', 'true'); // what GitHub allows by default
    git(origin, 'add', '-A');
    git(origin, 'commit', '-q', '-m', 'init');

    const dir = path.join(root, 'clone');
    const result = await partialClone({ url: `file://${origin}`, branch: null, dir });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.skipped, ['video.mp4']);
    assert.equal(await fs.readFile(path.join(dir, 'src', 'app.js'), 'utf8'), 'console.log(1)\n');
    assert.equal(await fs.readFile(path.join(dir, 'odd name.txt'), 'utf8'), 'spaces are fine\n');
    await assert.rejects(fs.access(path.join(dir, 'video.mp4')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
