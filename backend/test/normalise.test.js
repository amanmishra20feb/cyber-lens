import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSemgrep, parseGitleaks, parseOsv, merge, maskSecrets } from '../src/scanner/normalise.js';
import { toOwasp2025 } from '../src/owasp.js';
import { parseRepo, isBranch } from '../src/validate.js';

const DIR = '/sandbox/abc';

test('semgrep results become findings with OWASP 2025 codes and relative paths', () => {
  const [f] = parseSemgrep({ results: [{
    check_id: 'javascript.express.security.audit.express-open-redirect.express-open-redirect',
    path: '/sandbox/abc/src/app.js', start: { line: 41 }, end: { line: 41 },
    extra: { severity: 'WARNING', message: 'Open redirect', metadata: { cwe: ["CWE-601: URL Redirection to Untrusted Site ('Open Redirect')"], owasp: ['A01:2021 - Broken Access Control', 'A01:2025 - Broken Access Control'] } },
  }] }, DIR);
  assert.deepEqual(
    { file: f.file, line: f.line, severity: f.severity, cwe: f.cwe, owasp: f.owasp, title: f.title },
    { file: 'src/app.js', line: 41, severity: 'medium', cwe: ['CWE-601'], owasp: ['A01'], title: 'Express open redirect' },
  );
});

test('OWASP 2021-only labels are moved to their 2025 category', () => {
  assert.deepEqual(toOwasp2025(['A03:2021 - Injection']), ['A05']);
  assert.deepEqual(toOwasp2025(['A10:2021 - Server-Side Request Forgery (SSRF)']), ['A01']);
  assert.deepEqual(toOwasp2025(['A06:2021 - Vulnerable and Outdated Components']), ['A03']);
  assert.deepEqual(toOwasp2025([]), []);
});

test('gitleaks secrets are critical and keep the redacted match as snippet', () => {
  const [f] = parseGitleaks([{ RuleID: 'generic-api-key', Description: 'Detected a Generic API Key.', StartLine: 4, File: '/sandbox/abc/src/config.js', Match: "key: 'REDACTED'" }], DIR);
  assert.equal(f.severity, 'critical');
  assert.equal(f.file, 'src/config.js');
  assert.equal(f.snippet, "key: 'REDACTED'");
  assert.deepEqual(f.owasp, ['A07']);
});

test('osv groups become one finding per vulnerability with CVSS severity and the fix version', () => {
  const findings = parseOsv({ results: [{ source: { path: '/sandbox/abc/package-lock.json' }, packages: [{
    package: { name: 'lodash', version: '4.17.15' },
    groups: [{ ids: ['GHSA-p6mc-m468-83gw'], aliases: ['CVE-2020-8203', 'GHSA-p6mc-m468-83gw'], max_severity: '7.4' }, { ids: ['GHSA-x'], aliases: [], max_severity: '' }],
    vulnerabilities: [
      { id: 'GHSA-p6mc-m468-83gw', summary: 'Prototype Pollution in lodash', database_specific: { cwe_ids: ['CWE-1321'] }, affected: [{ ranges: [{ events: [{ introduced: '0' }, { fixed: '4.17.19' }] }] }] },
      { id: 'GHSA-x', summary: 'Other', database_specific: { severity: 'MODERATE' } },
    ],
  }] }] }, DIR);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].ruleId, 'CVE-2020-8203');
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].message, /Upgrade to 4\.17\.19/);
  assert.deepEqual(findings[0].cwe, ['CWE-1321']);
  assert.equal(findings[1].severity, 'medium');
});

test('merge keeps one finding per file, line and CWE, and records every engine', () => {
  const base = { file: 'a.js', line: 3, cwe: ['CWE-79'], owasp: ['A05'], ruleId: 'r1', title: 'XSS' };
  const merged = merge([
    { ...base, engine: 'semgrep', severity: 'medium' },
    { ...base, engine: 'semgrep', ruleId: 'r2', severity: 'high' },
    { ...base, engine: 'gitleaks', cwe: ['CWE-798'], severity: 'critical' },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].severity, 'critical'); // sorted most severe first
  const xss = merged.find((f) => f.cwe[0] === 'CWE-79');
  assert.equal(xss.severity, 'high');
  assert.deepEqual(xss.engines, ['semgrep']);
  assert.equal(xss.fingerprint.length, 64);
  assert.equal('engine' in xss, false);
});

test('secrets in snippets are masked, ordinary code is not', () => {
  assert.equal(maskSecrets("const key = 'Zq8vK2mX9pL4tR7wY1nB5cH3jF6dG0sA';"), "const key = 'Zq8v••••G0sA';"); // gitleaks:allow (a fake key)
  assert.equal(maskSecrets('const somethingVeryLongButHarmless = 1;'), 'const somethingVeryLongButHarmless = 1;');
});

test('only public github.com repo URLs and sane branch names are accepted', () => {
  assert.deepEqual(parseRepo('https://github.com/OWASP/NodeGoat.git'), { owner: 'OWASP', name: 'NodeGoat', url: 'https://github.com/OWASP/NodeGoat' });
  assert.equal(parseRepo('https://github.com/OWASP/NodeGoat/').url, 'https://github.com/OWASP/NodeGoat');
  for (const bad of ['http://github.com/a/b', 'https://gitlab.com/a/b', 'https://github.com/a', 'https://github.com/a/b/tree/main', 'https://github.com/a/..', 'https://github.com/-a/b', 'https://github.com/a/b;rm -rf /', '--upload-pack=x', null])
    assert.equal(parseRepo(bad), null, String(bad));
  assert.equal(isBranch('feature/login-v2'), true);
  for (const bad of ['-x', 'a..b', 'a b', '$(id)', '']) assert.equal(isBranch(bad), false, bad);
});

test('the same CVE in two versions of a package stays two findings', () => {
  const dep = (version) => ({ engine: 'osv', file: 'package-lock.json', line: null, ruleId: 'CVE-2020-8203', title: `lodash ${version}: Prototype Pollution`, cwe: [], owasp: ['A03'], severity: 'high' });
  assert.equal(merge([dep('2.4.2'), dep('4.17.15')]).length, 2);
});
