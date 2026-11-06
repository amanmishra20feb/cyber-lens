// The tables live in migrations/*.sql. This file keeps the allowed values and the column lists the routes share.
export const FINAL = ['done', 'failed', 'cancelled'];
export const IGNORE_REASONS = ['false_positive', 'acceptable_risk', 'no_time'];
export const ROLES = ['free', 'pro', 'admin'];
export { SEVERITIES } from './scanner/normalise.js';

// Never add password_hash here: these are the columns that may leave the server.
export const USER_COLUMNS = 'id, email, name, role, created_at';
// Everything but `files` (the Repo Map list, up to 1,500 entries), for lists and live progress.
export const SCAN_COLUMNS = 'id, user_id, repo_url, branch, commit, status, error, counts, engines, file_count, skip_large, skipped, started_at, finished_at, created_at';
// A SQL condition for "status is not final"; FINAL is a constant, never user input.
export const NOT_FINAL = `status NOT IN (${FINAL.map((s) => `'${s}'`).join(', ')})`;
