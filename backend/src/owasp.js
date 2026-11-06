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

// Rules still labelled only with OWASP 2021 are moved to the 2025 category that absorbed them.
const FROM_2021 = { A01: 'A01', A02: 'A04', A03: 'A05', A04: 'A06', A05: 'A02', A06: 'A03', A07: 'A07', A08: 'A08', A09: 'A09', A10: 'A01' };

// Labels look like "A05:2025 - Injection" or "A03:2021 - Injection".
export function toOwasp2025(labels = []) {
  const codes = (year) => labels.map((l) => new RegExp(`^(A\\d\\d):${year}`).exec(l)?.[1]).filter(Boolean);
  const out = codes(2025).length ? codes(2025) : codes(2021).map((c) => FROM_2021[c]);
  return [...new Set(out)];
}
