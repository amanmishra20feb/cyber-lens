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
export const STATUS_TEXT = { queued: 'Queued', cloning: 'Cloning', scanning: 'Scanning', saving: 'Saving', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' };

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
export const STATUS_LABEL = { open: 'Open', fixed: 'Fixed', ignored: 'Ignored' };

export const PLAN_NAME = { free: 'Free', pro: 'Pro', admin: 'Admin' };
