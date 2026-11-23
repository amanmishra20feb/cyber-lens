-- Every login token carries token_version; raising it signs the user out on every device.
ALTER TABLE users ADD COLUMN token_version integer NOT NULL DEFAULT 0;

-- Sign in with GitHub: accounts made that way have a GitHub id and no password.
ALTER TABLE users ADD COLUMN github_id bigint UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
