BEGIN;

DROP TABLE IF EXISTS discord_membership_grant_checks;

CREATE OR REPLACE FUNCTION insert_default_data_grant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO data_grants (user_id, source, storage_bytes, description)
  VALUES (NEW.id, 'base', 150000000, 'Default storage allocation');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Base grants changed by the up migration cannot be safely distinguished from
-- grants that already had the same value, so their previous values are not restored.

COMMIT;
