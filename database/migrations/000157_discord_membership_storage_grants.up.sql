BEGIN;

CREATE OR REPLACE FUNCTION insert_default_data_grant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO data_grants (user_id, source, storage_bytes, description)
  VALUES (NEW.id, 'base', 100000000, 'Default storage allocation');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE data_grants AS grants
SET storage_bytes = 100000000
FROM chronicle_users AS users
WHERE grants.user_id = users.id
  AND grants.source = 'base'
  AND users.consumed_storage_bytes < 150000000;

CREATE TABLE discord_membership_grant_checks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  next_check_at TIMESTAMPTZ NOT NULL,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  is_member BOOLEAN,
  last_outcome TEXT CHECK (last_outcome IS NULL OR last_outcome IN ('member', 'non_member', 'error')),
  last_error TEXT,
  suspended_until_login BOOLEAN NOT NULL DEFAULT FALSE,
  claim_token UUID,
  claim_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (claim_token IS NULL AND claim_expires_at IS NULL)
    OR (claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)
  )
);

CREATE INDEX discord_membership_grant_checks_due_idx
  ON discord_membership_grant_checks (next_check_at, user_id)
  WHERE suspended_until_login = FALSE;

INSERT INTO discord_membership_grant_checks (user_id, next_check_at)
SELECT
  links.user_id,
  statement_timestamp() + make_interval(
    secs => (
      ('x' || SUBSTRING(MD5(links.user_id::TEXT), 1, 8))::BIT(32)::BIGINT
      % 604800
    )::INTEGER
  )
FROM (
  SELECT DISTINCT user_id
  FROM user_auth_links
  WHERE provider = 'discord'
) AS links
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
