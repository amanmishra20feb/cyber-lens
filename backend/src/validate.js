// owner follows GitHub's rules (max 39 chars); an optional .git or trailing slash is fine
const REPO = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;
// no leading "-" (it would be read as a git option) and no ".."
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRepo(input) {
  const m = REPO.exec(String(input ?? '').trim());
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return { owner: m[1], name: m[2], url: `https://github.com/${m[1]}/${m[2]}` };
}

export const isBranch = (b) => typeof b === 'string' && BRANCH.test(b);

// checking the shape first turns a bad id into a 404 instead of a database error
export const isId = (id) => typeof id === 'string' && UUID.test(id);
