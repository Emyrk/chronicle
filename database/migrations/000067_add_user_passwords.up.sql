CREATE TABLE user_passwords (
    user_auth_id UUID PRIMARY KEY REFERENCES user_auth_links(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replace the existing unique index with a case-insensitive version
DROP INDEX user_auths_unique_linked_id;
CREATE UNIQUE INDEX user_auths_unique_linked_id ON user_auth_links(LOWER(linked_id), provider);
