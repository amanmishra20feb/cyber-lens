import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanRepo, ScanError } from '../src/scanner/scan.js';

test('a repo over 200 MB is refused before cloning, with its size in the message', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ size: 1_452_612, private: false });
  try {
    await assert.rejects(scanRepo({ id: 'big', repoUrl: 'https://github.com/owner/huge' }), (e) => e instanceof ScanError && /1\.5 GB/.test(e.message));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('private and missing repos are refused with a clear message', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ size: 10, private: true });
    await assert.rejects(scanRepo({ id: 'p', repoUrl: 'https://github.com/owner/secret' }), /private/);
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(scanRepo({ id: 'm', repoUrl: 'https://github.com/owner/missing' }), /not found/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
