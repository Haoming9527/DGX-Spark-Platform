-- Run once against the existing application database before assigning operators.
-- This changes only the role constraint; accounts, passwords, and data stay intact.
BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('user', 'operator', 'admin')) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_role_check;

COMMIT;
