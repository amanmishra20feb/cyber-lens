# Cyberlens

Scans public GitHub repos for security problems with Semgrep, Gitleaks and OSV-Scanner plus our
own rules, and maps every finding to OWASP Top 10:2025 and CWE. Capstone project, 2026.

- Paste a public GitHub repo URL and watch the three engines report live
- One merged, de-duplicated list of findings, ranked by severity, with the code around each one
- A Repo Map: every file as a tile, coloured by its worst open finding
- Triage each finding (open, fixed, ignored with a reason); free, Pro and admin plans with daily scan limits, and an admin page to change a plan
- Repos over 200 MB are scanned without their large files, after asking you first

Stack: React 19, Vite, Tailwind, react-router, TanStack Query; Node 24, Express 5, PostgreSQL (plain SQL with `pg`);
Semgrep, Gitleaks, OSV-Scanner; Docker.

## Run it locally

Needs Node 22+, git, and the three engines (`brew install semgrep gitleaks osv-scanner`, or use
Docker below).

```bash
cd backend && cp .env.example .env    # set JWT_SECRET; leave DATABASE_URL empty for an in-memory database
npm install && npm run dev            # API on http://localhost:4000
```

```bash
cd frontend && npm install && npm run dev   # app on http://localhost:5173
```

With Docker instead (Postgres + one container with the API, the built app and the engines; open http://localhost:4000):

```bash
docker compose up --build
```

Settings in `backend/.env` (see `.env.example`): `JWT_SECRET` (required), `DATABASE_URL` (a Postgres connection string; empty = in-memory database),
`ADMIN_EMAILS`, optional `GITHUB_TOKEN`. On a small host (about 512 MB) set `LOW_MEMORY=1`: engines run one
after another. Set `STATIC_DIR` to the built frontend and the API serves the app too (the Docker image does this).

## Checks

```bash
cd backend && npm test          # API, auth, ownership, limits, normaliser, partial clone
cd frontend && npm test         # Repo Map layout, colour contrast, checkout validation
cd backend && npm run benchmark # scans cyberlens-goat, writes benchmark.json
```

`cyberlens-goat/` is a deliberately vulnerable app. Never deploy it.
