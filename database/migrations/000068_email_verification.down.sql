ALTER TABLE user_passwords
    DROP COLUMN email_verified,
    DROP COLUMN verification_token_hash,
    DROP COLUMN verification_token_expires_at,
    DROP COLUMN verification_token_created_at;
