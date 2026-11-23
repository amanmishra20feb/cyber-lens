-- Sign in with Google: accounts made that way have a Google id and no password.
ALTER TABLE users ADD COLUMN google_id text UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
