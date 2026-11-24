# Cyberlens

Scans public GitHub repos for security problems with Semgrep, Gitleaks and OSV-Scanner plus our
own rules, and maps every finding to OWASP Top 10:2025 and CWE. Capstone project, 2026.

- Paste a public GitHub repo URL and watch the three engines report as each one finishes
- One merged list of findings, worst first, with the code around each one and how to fix it
- A Repo Map: every file as a tile, coloured by its worst open finding
- Triage each finding: open, fixed, or ignored with a reason
- An OWASP Top 10:2025 table that says honestly what Cyberlens can and cannot check
- Accounts with email and password, or Google; sign out on every device; delete your account and all its data

Stack: React 19, Vite, Tailwind, react-router, TanStack Query; Node 24, Express 5, PostgreSQL (plain SQL with `pg`);
Semgrep, Gitleaks, OSV-Scanner; Docker.

## How a scan works

1. The API checks on GitHub that the repo is public and under 200 MB.
2. It shallow-clones the repo into a temporary folder.
3. Semgrep (OWASP rules and our own in `backend/rules/`), Gitleaks and OSV-Scanner run on it.
4. Their results become one list: the same problem on the same line from two engines is one finding, secrets are masked.
5. Findings are saved with their OWASP and CWE labels, and the temporary folder is deleted.

The browser asks for the scan every 2 seconds until it is finished.

## Run it locally

Needs Node 22+, git, and the three engines:

```bash
brew install semgrep gitleaks osv-scanner
```

Install once:

```bash
cd backend && npm install && cp .env.example .env
```

```bash
cd frontend && npm install
```

Put at least 32 random characters in `JWT_SECRET` in `backend/.env`. Leave `DATABASE_URL` empty to use an in-memory
database that is lost when the server stops. Then, from the repo root:

```bash
npm run dev
```

This starts the API on port 4000 and the app on http://localhost:5173. Ctrl+C stops both.

With Docker instead (Postgres + one container with the API, the built app and the engines; open http://localhost:4000):

```bash
docker compose up --build
```

## Settings (`backend/.env`)

| Name | Needed | What it does |
|---|---|---|
| `JWT_SECRET` | yes | Signs the login cookie. At least 32 random characters |
| `DATABASE_URL` | no | Postgres connection string. Empty = in-memory database |
| `GITHUB_TOKEN` | no | Any GitHub token; raises GitHub's limit for the repo size check |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Both set = a "Continue with Google" button. Create a Web OAuth client in Google Cloud and register `<your address>/api/auth/google/callback` as a redirect URI |
| `LOW_MEMORY` | no | `1` on a host with about 512 MB: engines run one after another |
| `STATIC_DIR` | no | Folder of the built frontend; the API then serves the app too (the Docker image does this) |

## Checks

```bash
cd backend && npm test
```

```bash
cd frontend && npm test && npx vite build
```

```bash
cd backend && npm run benchmark
```

The backend tests cover the API, accounts, who can see what, limits, and the finding parser. They run on
an in-memory Postgres. The frontend tests cover the Repo Map layout and colour contrast. The benchmark scans
`backend/goat/`, a small app with planted bugs, and writes how many it found to `frontend/src/landing/benchmark.json`.
`npm run record-scan` scans OWASP NodeGoat for the landing page. GitHub Actions runs the tests, the build and the Docker build on every push.

## Deploy

One Docker image holds the API, the built frontend and the engines (`docker build -f backend/Dockerfile .` from the repo root).
Give it `JWT_SECRET`, `DATABASE_URL` (for example a Neon Postgres) and `LOW_MEMORY=1` on a small host.
It listens on port 4000 and creates its tables on start.

`backend/goat/` is a deliberately vulnerable app used as test data. Never deploy it.
