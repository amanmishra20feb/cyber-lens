export const FINAL = ['done', 'failed', 'cancelled'];
export const NOT_FINAL = "status NOT IN ('done', 'failed', 'cancelled')";
export const IGNORE_REASONS = ['false_positive', 'acceptable_risk', 'no_time'];
export { SEVERITIES } from './scanner/normalise.js';

// Columns that may be sent to the browser. Never add password_hash here.
export const USER_COLUMNS = 'id, email, name, created_at';
// Everything except `files`, which can hold 1,500 entries for the repo map.
export const SCAN_COLUMNS = 'id, user_id, repo_url, branch, commit, status, error, counts, engines, file_count, started_at, finished_at, created_at';
