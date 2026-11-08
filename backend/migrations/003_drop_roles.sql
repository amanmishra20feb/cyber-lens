-- One product for everyone: no plans, no admins.
ALTER TABLE users DROP COLUMN role;
