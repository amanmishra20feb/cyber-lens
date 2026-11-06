// Only public github.com repos: owner (GitHub's 39-char rule) and repo name, optional .git or slash.
const REPO = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,100}$/;

export function parseRepo(input) {
  const m = REPO.exec(String(input ?? '').trim());
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return { owner: m[1], name: m[2], url: `https://github.com/${m[1]}/${m[2]}` };
}

export const isBranch = (b) => typeof b === 'string' && BRANCH.test(b);

// Database ids are UUIDs. Checking the shape first turns a bad id into a plain 404 instead of a database error.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (id) => typeof id === 'string' && UUID.test(id);
