# cyberlens-goat

A deliberately vulnerable Express app. **Do not deploy it.** It is the benchmark Cyberlens is
measured against.

- Every planted bug has a `// VULN: <CWE> <OWASP 2025>` comment on its line.
- Every safe look-alike has a `// SAFE` comment. A finding on a `SAFE` line is a false alarm.
- Vulnerable dependencies are listed in `expected-deps.json` (comments cannot go in a lockfile).

Run the benchmark from `backend/`: `npm run benchmark`.
