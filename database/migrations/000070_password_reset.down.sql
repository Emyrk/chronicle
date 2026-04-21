ALTER TABLE user_passwords
    DROP COLUMN reset_token_hash,
    DROP COLUMN reset_token_expires_at,
    DROP COLUMN reset_token_created_at;
