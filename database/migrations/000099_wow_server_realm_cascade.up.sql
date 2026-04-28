ALTER TABLE wow_server_realms
  DROP CONSTRAINT IF EXISTS wow_server_realms_server_id_fkey;

ALTER TABLE wow_server_realms
  ADD CONSTRAINT wow_server_realms_server_id_fkey
  FOREIGN KEY (server_id) REFERENCES wow_servers(id) ON DELETE CASCADE;