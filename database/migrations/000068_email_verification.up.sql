ALTER TABLE user_passwords
    ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN verification_token_hash TEXT,
    ADD COLUMN verification_token_expires_at TIMESTAMPTZ,
    ADD COLUMN verification_token_created_at TIMESTAMPTZ;
