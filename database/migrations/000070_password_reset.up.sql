ALTER TABLE user_passwords
    ADD COLUMN reset_token_hash TEXT,
    ADD COLUMN reset_token_expires_at TIMESTAMPTZ,
    ADD COLUMN reset_token_created_at TIMESTAMPTZ;
