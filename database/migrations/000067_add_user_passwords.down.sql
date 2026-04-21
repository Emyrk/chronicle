-- Restore the original case-sensitive unique index
DROP INDEX IF EXISTS user_auths_unique_linked_id;
CREATE UNIQUE INDEX user_auths_unique_linked_id ON user_auth_links(linked_id, provider);

DROP TABLE IF EXISTS user_passwords;
