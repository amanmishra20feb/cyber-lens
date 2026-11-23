import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMe } from '../auth.jsx';
import { Coverage } from '../components/Coverage.jsx';
import { EngineBeams } from '../components/EngineBeams.jsx';
import { Logo } from '../components/Logo.jsx';
import { PageTitle } from '../components/PageTitle.jsx';
import { RepoMap } from '../components/RepoMap.jsx';
import { Severity } from '../components/Severity.jsx';
import { ENGINE_NAMES, OWASP_2025, SEVERITIES } from '../format.js';
import scan from './nodegoat-scan.json';
import benchmark from './benchmark.json';

const EXAMPLE = 'https://github.com/OWASP/NodeGoat';
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const h2 = 'text-[32px] leading-[1.1] font-medium tracking-[-0.01em]';
const gap = 'mt-20 md:mt-28';
const action = 'inline-flex h-10 items-center whitespace-nowrap rounded-lg bg-ink px-5 font-medium text-bg hover:opacity-90 md:h-11';
const SECTIONS = [['how', 'How it works'], ['benchmark', 'Benchmark'], ['coverage', 'Coverage'], ['faq', 'Questions']];

const sharedFindings = scan.findings.filter((f) => f.engines.length > 1).length;
const categories = new Set(scan.findings.flatMap((f) => f.owasp)).size;
const shared = scan.findings.find((f) => f.engines.length > 1);

const STEPS = [
  ['Clone', 'The repo is copied into a temporary folder and deleted when the scan ends. Private repos and repos over 200 MB are refused.', null],
  ['Scan', 'Semgrep reads the code, Gitleaks looks for committed passwords and keys, and OSV-Scanner checks the dependencies against published vulnerabilities.', null, <div data-ui className="mt-5"><EngineBeams finished={scan.engines} oneAtATime={false} /></div>],
  ['Merge', 'When two engines report the same problem on the same line, you see one finding that names both.', `On NodeGoat, ${sharedFindings} finding${sharedFindings === 1 ? ' was' : 's were'} reported by more than one engine.`, shared && (
    <div data-ui className="mt-4 max-w-[560px] rounded-xl bg-surface p-4 text-[15px]">
      <Severity level={shared.severity} />
      <p className="mt-2 font-medium">{shared.title}</p>
      <p className="mt-1 break-all text-muted">{shared.file}{shared.line ? `:${shared.line}` : ''}</p>
      <p className="mt-1 text-muted">Found by {shared.engines.map((e) => ENGINE_NAMES[e]).join(' and ')}</p>
    </div>
  )],
  ['Map', 'Every finding gets its OWASP Top 10:2025 category and CWE number, and says how to fix it.', `The NodeGoat findings fall into ${categories} of the 10 categories.`],
  ['Triage', 'You mark each finding fixed, or ignore it with a reason: false positive, acceptable risk, or no time to fix.', null],
];

const FAQ = [
  ['Is my code stored?', 'No. The repo is deleted as soon as the scan ends. Cyberlens keeps only the findings: file, line, and a short code snippet with secrets masked.'],
  ['Can I scan a private repo?', 'No. Cyberlens scans public github.com repos only and never asks for access to your code.'],
  ['Which languages does it check?', 'Semgrep’s OWASP rules cover JavaScript, TypeScript, Python, Java, Go, PHP, Ruby and more. Our own rules are for JavaScript and TypeScript. Gitleaks reads every text file, and OSV-Scanner reads lockfiles such as package-lock.json, requirements.txt and go.sum.'],
  ['Is this a penetration test?', 'No. Cyberlens reads the code without running it. It cannot see how the app is deployed or find flaws in its design; the coverage table shows what it checks.'],
  ['Can I trust the findings?', 'Each finding names the engine and rule that found it, the file and line. Scanners raise false alarms, so check each one and ignore it with a reason when it is wrong.'],
];

// Signed out, the repo URL survives sign-up through ?next=, and the New scan page fills it in.
function ScanForm({ id, inverse = false }) {
  const navigate = useNavigate();
  const { data: user } = useMe();
  const input = useRef(null);
  const submit = (e) => {
    e.preventDefault();
    const app = `/app?repo=${encodeURIComponent(new FormData(e.currentTarget).get('repoUrl'))}`;
    navigate(user ? app : `/signup?next=${encodeURIComponent(app)}`);
  };
  return (
    <>
      <form onSubmit={submit} className="flex flex-wrap gap-3">
        <label htmlFor={id} className="sr-only">Public GitHub repo URL</label>
        <input ref={input} id={id} name="repoUrl" required placeholder="https://github.com/owner/repo" className="h-12 min-w-0 flex-1 basis-60 rounded-lg border border-rule bg-surface px-4 text-[16px] text-ink placeholder:text-muted" />
        <button className={`inline-flex h-12 items-center rounded-lg px-7 text-[16px] font-medium hover:opacity-90 ${inverse ? 'bg-bg text-ink' : 'bg-ink text-bg'}`}>Scan</button>
      </form>
      <p className={`mt-3 text-[14px] ${inverse ? 'text-bg/70' : 'text-muted'}`}>
        Public github.com repos only, free account.{' '}
        <button type="button" onClick={() => { input.current.value = EXAMPLE; input.current.focus(); }} className="underline underline-offset-4 hover:no-underline">Try OWASP/NodeGoat</button>
      </p>
    </>
  );
}

function RecordedScan() {
  const [file, setFile] = useState(null);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, scan.findings.filter((f) => f.severity === s).length]));
  const inFile = scan.findings.filter((f) => f.file === file);
  return (
    <section className="mt-20 lg:mt-16" aria-labelledby="recorded">
      <div className="reveal flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="max-w-[62ch]">
          <h2 id="recorded" className={h2}>A real scan of OWASP NodeGoat</h2>
          <p className="mt-2 text-[15px] text-muted">
            An app OWASP made insecure on purpose. Recorded on {day(scan.scannedAt)} at commit{' '}
            <a href={`${scan.repoUrl}/tree/${scan.commit}`} className="underline underline-offset-4">{scan.commit.slice(0, 7)}</a>: {scan.findings.length} findings in {scan.fileCount} files, {scan.seconds} seconds.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-1" aria-label="Findings by severity">
          {SEVERITIES.map((s) => <li key={s}><Severity level={s} /> <span className="num font-medium">{counts[s]}</span></li>)}
        </ul>
      </div>
      <div data-ui className="mt-5">
        <RepoMap files={scan.files} fileCount={scan.fileCount} findings={scan.findings} selected={file} onSelect={setFile} />
      </div>
      {file && (
        <div className="mt-6 rounded-xl bg-surface p-5" aria-live="polite">
          <h3 className="break-all font-medium">{file}</h3>
          <ul className="mt-3 space-y-2 text-[15px]">
            {inFile.slice(0, 10).map((f, i) => (
              <li key={i} className="flex flex-wrap gap-x-4">
                <Severity level={f.severity} />
                <span className="min-w-0 flex-1">{f.title}</span>
                <span className="text-muted">{f.line ? `line ${f.line}` : 'dependency'}{f.owasp[0] && `, ${f.owasp[0]} ${OWASP_2025[f.owasp[0]]}`}</span>
              </li>
            ))}
          </ul>
          {inFile.length > 10 && <p className="mt-3 text-[15px] text-muted">And {inFile.length - 10} more in this file.</p>}
        </div>
      )}
    </section>
  );
}

export function LandingPage() {
  const { data: user } = useMe();
  return (
    <div className="text-[17px]">
      <PageTitle>Security scans for public GitHub repos</PageTitle>
      <header className="sticky top-0 z-20 bg-bg">
        <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-6 px-4 md:h-24">
          <Link to="/"><Logo className="h-9 md:h-12" /></Link>
          <nav aria-label="On this page" className="hidden items-center gap-8 whitespace-nowrap lg:flex">
            {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className="hover:underline underline-offset-4">{label}</a>)}
          </nav>
          <div className="flex items-center gap-4 whitespace-nowrap md:gap-6">
            {user ? (
              <Link to="/app" className={action}>Open the app</Link>
            ) : (
              <>
                <Link to="/login" className="hover:underline underline-offset-4">Sign in</Link>
                <Link to="/signup" className={action}><span className="lg:hidden">Sign up</span><span className="hidden lg:inline">Create account</span></Link>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1200px] px-4">
        <main>
          <section className="pt-8 md:pt-12" aria-labelledby="hero">
            <h1 id="hero" className="page-in max-w-[22ch] text-[clamp(36px,7.2vw,88px)] leading-[1.02] font-medium tracking-[-0.03em]">Find security problems in public GitHub repos</h1>
            <div className="mt-8 grid gap-8 md:mt-10 md:grid-cols-2 md:items-start md:gap-12">
              <p className="page-in max-w-[46ch]" style={{ animationDelay: '70ms' }}>
                Paste a repo link. Cyberlens runs Semgrep, Gitleaks and OSV-Scanner plus its own rules, merges what they find, and maps every finding to the OWASP Top 10:2025 and CWE.
              </p>
              <div className="page-in" style={{ animationDelay: '140ms' }}><ScanForm id="repo-top" /></div>
            </div>
          </section>

          <RecordedScan />

          <section className={gap} aria-labelledby="how">
            <h2 id="how" className={`reveal ${h2}`}>How a scan works</h2>
            <ol className="mt-10 space-y-12">
              {STEPS.map(([title, text, fact, extra]) => (
                <li key={title} className="reveal grid gap-x-10 gap-y-1 md:grid-cols-[9rem_1fr]">
                  <h3 className="text-[22px] font-medium">{title}</h3>
                  <div>
                    <p className="max-w-[62ch]">{text}</p>
                    {fact && <p className="mt-1 text-[15px] text-muted">{fact}</p>}
                    {extra}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className={gap} aria-labelledby="benchmark">
            <div className="grid gap-8 md:grid-cols-[1fr_1.1fr] md:items-end md:gap-14">
              <div className="reveal">
                <h2 id="benchmark" className={h2}>Tested on our own vulnerable app</h2>
                <p className="mt-3 max-w-[52ch]">
                  We wrote a small Express app with {benchmark.planted} planted bugs and safe look-alikes that must not be flagged, then scan it whenever the rules change. Last run on {day(benchmark.date)}.
                </p>
                <p className="mt-3 text-[14px] text-muted">Our own test, not an independent one. Real repos have more variety than any test app.</p>
              </div>
              <p className="reveal text-[clamp(26px,3.2vw,36px)] leading-[1.15] font-medium tracking-[-0.01em]">
                Found <span className="num">{benchmark.found} of {benchmark.planted}</span> planted bugs. Missed <span className="num">{benchmark.missed.length}</span>. False alarms <span className="num">{benchmark.falseAlarms.length}</span>.
              </p>
            </div>
          </section>

          <Coverage findings={scan.findings} wide countLabel="In the NodeGoat scan" />

          <section className={gap} aria-labelledby="faq">
            <div className="grid gap-8 md:grid-cols-[1fr_1.7fr] md:gap-12">
              <div className="reveal">
                <h2 id="faq" className={h2}>Questions</h2>
                <p className="mt-3 max-w-[32ch] text-muted">Short answers about your code, privacy and how far to trust the results.</p>
              </div>
              <div className="space-y-3">
                {FAQ.map(([q, a]) => (
                  <details key={q} className="reveal rounded-xl bg-surface px-5 py-4">
                    <summary className="cursor-pointer font-medium">{q}</summary>
                    <p className="mt-2 text-muted">{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>

      <footer className={`${gap} bg-ink text-bg`}>
        <div className="mx-auto max-w-[1200px] px-4 pt-16 md:pt-24">
          <h2 className="reveal text-[clamp(32px,5vw,56px)] leading-[1.05] font-medium tracking-[-0.02em]">How does your repo look?</h2>
          <p className="reveal mt-3 max-w-[46ch] text-bg/70">The NodeGoat scan above took {scan.seconds} seconds. Paste a link and find out.</p>
          <div className="mt-8 max-w-[640px]"><ScanForm id="repo-bottom" inverse /></div>
          <div className="mt-16 md:mt-20">
            <p className="reveal flex items-baseline justify-between pb-8 text-[length:clamp(40px,6vw,76px)] leading-none font-medium tracking-[-0.03em]">
              <span>Cyberlens</span>
              <span className="text-bg/45">2026</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
