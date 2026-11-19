export const OWASP_2025 = {
  A01: 'Broken Access Control',
  A02: 'Security Misconfiguration',
  A03: 'Software Supply Chain Failures',
  A04: 'Cryptographic Failures',
  A05: 'Injection',
  A06: 'Insecure Design',
  A07: 'Authentication Failures',
  A08: 'Software or Data Integrity Failures',
  A09: 'Security Logging and Alerting Failures',
  A10: 'Mishandling of Exceptional Conditions',
};

export const ENGINE_NAMES = { semgrep: 'Semgrep', gitleaks: 'Gitleaks', osv: 'OSV-Scanner' };
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const FINAL = ['done', 'failed', 'cancelled'];
export const SEVERITY_TEXT = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const SCAN_STATUS_TEXT = { queued: 'Queued', cloning: 'Cloning', scanning: 'Scanning', saving: 'Saving', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' };

const ENGINE_ORDER = ['semgrep', 'gitleaks', 'osv']; // the order the server runs them in

// One at a time, only the first unfinished engine is really running.
export function engineStates(finished, oneAtATime) {
  const next = ENGINE_ORDER.find((name) => !finished.some((e) => e.name === name));
  return ENGINE_ORDER.map((name) => {
    const result = finished.find((e) => e.name === name);
    if (result) return { ...result, state: result.ok ? 'done' : 'failed' };
    return { name, state: oneAtATime && name !== next ? 'waiting' : 'running' };
  });
}

export const repoName = (url) => url.replace('https://github.com/', '');

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function timeAgo(date) {
  const s = (new Date(date) - Date.now()) / 1000;
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  return 'just now';
}

export const duration = (a, b) => {
  const s = Math.round((new Date(b) - new Date(a)) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

export const IGNORE_REASON_TEXT = { false_positive: 'False positive', acceptable_risk: 'Acceptable risk', no_time: 'No time to fix' };
export const FINDING_STATUS_TEXT = { open: 'Open', fixed: 'Fixed', ignored: 'Ignored' };

