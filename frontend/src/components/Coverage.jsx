import { OWASP_2025 } from '../format.js';

// What Cyberlens can and cannot check for each OWASP Top 10:2025 category. Shown on every scan and on the landing page.
const COVERAGE = [
  { id: 'A01', level: 'partly', how: 'Semgrep finds path traversal and open redirects. Whether each route checks the right user depends on the app’s rules, so most of this needs a manual review.' },
  { id: 'A02', level: 'partly', how: 'Our rules find cookies without HttpOnly and Express apps without helmet. Server and cloud settings are not in the code.' },
  { id: 'A03', level: 'checked', how: 'OSV-Scanner reads the lockfiles and finds dependencies with known vulnerabilities.' },
  { id: 'A04', level: 'checked', how: 'Semgrep and our rules find weak hashes (MD5, SHA-1) and Math.random() used for tokens.' },
  { id: 'A05', level: 'checked', how: 'Semgrep and our rules find SQL, OS command and NoSQL injection and cross-site scripting.' },
  { id: 'A06', level: 'not checked', how: 'A design flaw is not a line of code, so no scanner can find it. It needs threat modelling.' },
  { id: 'A07', level: 'partly', how: 'Gitleaks finds keys and passwords committed to the repo; our rules find hard-coded secrets and JWTs without an expiry.' },
  { id: 'A08', level: 'partly', how: 'Semgrep finds unsafe deserialisation and eval of untrusted data.' },
  { id: 'A09', level: 'partly', how: 'Our rule finds secrets written to logs. Whether attacks are logged and alerted on cannot be seen in the code.' },
  { id: 'A10', level: 'partly', how: 'Our rules find empty catch blocks and stack traces sent to users.' },
];

const LEVEL_TEXT = { checked: 'Checked', partly: 'Partly checked', 'not checked': 'Not checked' };

export function Coverage({ findings, wide = false, countLabel = 'Open findings' }) {
  const open = findings.filter((f) => f.status === 'open');
  return (
    <section className={`reveal ${wide ? 'mt-20 md:mt-28' : 'mt-12'}`} aria-labelledby="coverage">
      <h2 id="coverage" className={wide ? 'text-[32px] leading-[1.1] font-medium tracking-[-0.01em]' : 'text-[22px] font-medium'}>OWASP Top 10 coverage</h2>
      <p className="mt-1 text-muted">What this scan can and cannot tell you. A category with no findings is not proof that it is safe.</p>
      <div className="mt-4 overflow-x-auto rounded-xl bg-surface">
        <table className="w-full text-left text-[14px]">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="p-3 font-normal">Category</th>
              <th scope="col" className="p-3 font-normal">Coverage</th>
              <th scope="col" className="hidden p-3 font-normal md:table-cell">How Cyberlens checks</th>
              <th scope="col" className="p-3 text-right font-normal">{countLabel}</th>
            </tr>
          </thead>
          <tbody>
            {COVERAGE.map((c) => {
              const count = open.filter((f) => f.owasp.includes(c.id)).length;
              return (
                <tr key={c.id} className="border-t border-rule align-top">
                  <th scope="row" className="p-3 font-normal">{c.id} {OWASP_2025[c.id]}</th>
                  <td className={`p-3 ${c.level === 'checked' ? '' : 'text-muted'}`}>{LEVEL_TEXT[c.level]}</td>
                  <td className="hidden p-3 text-muted md:table-cell">{c.how}</td>
                  <td className={`num p-3 text-right ${count ? '' : 'text-muted'}`}>{c.level === 'not checked' ? '–' : count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
