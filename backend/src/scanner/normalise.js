import path from 'node:path';
import { createHash } from 'node:crypto';
import { toOwasp2025 } from '../owasp.js';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const rank = (s) => SEVERITIES.indexOf(s);

const rel = (dir, file) => path.relative(dir, path.resolve(dir, file)).split(path.sep).join('/');
const cweIds = (list = []) => [...new Set(list.map((c) => /CWE-\d+/.exec(c)?.[0]).filter(Boolean))];
const titleFromRule = (id) => {
  const last = id.split('.').pop().replace(/[-_]+/g, ' ');
  return last.charAt(0).toUpperCase() + last.slice(1);
};

export function parseSemgrep(json, dir) {
  const sev = { ERROR: 'high', WARNING: 'medium', INFO: 'low', CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
  return (json.results ?? []).map((r) => ({
    engine: 'semgrep',
    ruleId: r.check_id,
    title: titleFromRule(r.check_id),
    message: r.extra?.message ?? '',
    severity: sev[r.extra?.severity] ?? 'medium',
    cwe: cweIds(r.extra?.metadata?.cwe),
    owasp: toOwasp2025(r.extra?.metadata?.owasp),
    file: rel(dir, r.path),
    line: r.start?.line ?? null,
    endLine: r.end?.line ?? null,
  }));
}

export function parseGitleaks(json, dir) {
  return (json ?? []).map((r) => ({
    engine: 'gitleaks',
    ruleId: `gitleaks.${r.RuleID}`,
    title: `Secret in code: ${r.RuleID.replace(/-/g, ' ')}`,
    message: `${r.Description} Anyone who can read this repo can use it. Revoke it, then load it from an environment variable.`,
    severity: 'critical',
    cwe: ['CWE-798'],
    owasp: ['A07'],
    file: rel(dir, r.File),
    line: r.StartLine ?? null,
    snippet: r.Match, // already redacted by --redact
  }));
}

export function parseOsv(json, dir) {
  const fromScore = (s) => (s >= 9 ? 'critical' : s >= 7 ? 'high' : s >= 4 ? 'medium' : 'low');
  const fromLabel = { CRITICAL: 'critical', HIGH: 'high', MODERATE: 'medium', MEDIUM: 'medium', LOW: 'low' };
  const out = [];
  for (const result of json.results ?? []) {
    for (const { package: pkg, groups = [], vulnerabilities = [] } of result.packages ?? []) {
      for (const group of groups) {
        const vulns = vulnerabilities.filter((v) => group.ids.includes(v.id));
        const first = vulns[0] ?? {};
        const score = parseFloat(group.max_severity);
        const fixed = first.affected?.flatMap((a) => a.ranges ?? []).flatMap((r) => r.events ?? []).find((e) => e.fixed)?.fixed;
        out.push({
          engine: 'osv',
          ruleId: group.aliases?.find((a) => a.startsWith('CVE-')) ?? group.ids[0],
          title: `${pkg.name} ${pkg.version}: ${first.summary ?? 'known vulnerability'}`,
          message: `${pkg.name}@${pkg.version} has a published vulnerability (${group.ids.join(', ')}).${fixed ? ` Upgrade to ${fixed} or later.` : ''}`,
          severity: Number.isFinite(score) ? fromScore(score) : fromLabel[first.database_specific?.severity] ?? 'medium',
          cwe: cweIds(vulns.flatMap((v) => v.database_specific?.cwe_ids ?? [])),
          owasp: ['A03'],
          file: rel(dir, result.source.path),
          line: null,
        });
      }
    }
  }
  return out;
}

// One finding per place and problem, whichever engines reported it.
export function merge(findings) {
  const byKey = new Map();
  for (const f of findings) {
    const key = f.line == null ? `${f.file}|${f.ruleId}|${f.title}` : `${f.file}|${f.line}|${f.cwe[0] ?? f.ruleId}`;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { ...f, engines: [f.engine], fingerprint: createHash('sha256').update(key).digest('hex') });
      continue;
    }
    if (!seen.engines.includes(f.engine)) seen.engines.push(f.engine);
    if (rank(f.severity) < rank(seen.severity)) seen.severity = f.severity;
    seen.owasp = [...new Set([...seen.owasp, ...f.owasp])];
    seen.snippet ??= f.snippet;
  }
  return [...byKey.values()].map(({ engine, ...f }) => f).sort((a, b) => rank(a.severity) - rank(b.severity));
}

// Mask anything that looks like a key or token: 16+ characters mixing letters and digits.
export const maskSecrets = (text) =>
  text.replace(/[A-Za-z0-9+/=_-]{16,}/g, (t) => (/\d/.test(t) && /[A-Za-z]/.test(t) ? `${t.slice(0, 4)}••••${t.slice(-4)}` : t));
