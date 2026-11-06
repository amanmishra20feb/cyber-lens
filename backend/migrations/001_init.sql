-- Cyberlens schema. Never edit a migration that has run on a real database: add 002_….sql instead.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,              -- stored trimmed and lower-case by the API
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  password_hash text NOT NULL,                     -- bcrypt; only the login query ever reads it
  role          text NOT NULL DEFAULT 'free' CHECK (role IN ('free', 'pro', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  repo_url    text NOT NULL,
  branch      text,
  commit      text,
  status      text NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued', 'cloning', 'scanning', 'saving', 'done', 'failed', 'cancelled')),
  error       text,
  counts      jsonb NOT NULL DEFAULT '{"critical": 0, "high": 0, "medium": 0, "low": 0}',
  engines     jsonb NOT NULL DEFAULT '[]',         -- one entry per engine as it finishes: {name, ok, count, error, ms}
  files       jsonb NOT NULL DEFAULT '[]',         -- Repo Map: [{path, loc}], largest 1,500 files
  file_count  integer,
  skip_large  boolean NOT NULL DEFAULT false,      -- the user agreed to scan a repo over 200 MB without its files over 1 MB
  skipped     jsonb,                               -- {count, paths}: the files left out (first 50 named)
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scans_user_created ON scans (user_id, created_at DESC);
-- At most one unfinished scan per user, enforced by the database, so two requests at the same instant cannot both start one.
CREATE UNIQUE INDEX scans_one_running_per_user ON scans (user_id) WHERE status IN ('queued', 'cloning', 'scanning', 'saving');

CREATE TABLE findings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id       uuid NOT NULL REFERENCES scans (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  engines       text[] NOT NULL DEFAULT '{}',
  rule_id       text,
  title         text,
  message       text,
  severity      text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  cwe           text[] NOT NULL DEFAULT '{}',
  owasp         text[] NOT NULL DEFAULT '{}',
  file          text NOT NULL,
  line          integer,
  end_line      integer,
  snippet       text,                              -- secrets masked before saving
  snippet_line  integer,
  fingerprint   text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'ignored')),
  ignore_reason text CHECK (ignore_reason IN ('false_positive', 'acceptable_risk', 'no_time')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id, fingerprint)
);
CREATE INDEX findings_user ON findings (user_id);
