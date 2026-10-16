BEGIN;

DROP TABLE IF EXISTS oauth_token_sessions;
DROP TABLE IF EXISTS oauth_device_sessions;
DROP TABLE IF EXISTS oauth_server_secrets;

COMMIT;
