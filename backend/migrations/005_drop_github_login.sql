-- Sign in with GitHub was dropped: every account has a password again.
ALTER TABLE users DROP COLUMN github_id;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
