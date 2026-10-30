BEGIN;

-- linked_id carries the OAuth identity of a Discord link from the callback on
-- the access URL back to the site that started the link. Rows live for at most
-- a minute, so the table stays tiny.
ALTER TABLE oauth_relay_codes ADD COLUMN linked_id text NOT NULL DEFAULT '';

COMMIT;
