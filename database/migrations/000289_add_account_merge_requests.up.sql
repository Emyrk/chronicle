BEGIN;

CREATE TABLE account_merge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL,
  source_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  discord_id text NOT NULL,
  source_username text NOT NULL,
  source_email text NOT NULL,
  target_username text NOT NULL,
  target_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  message text NOT NULL DEFAULT '',
  response text NOT NULL DEFAULT '',
  reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK (source_user_id <> target_user_id),
  CHECK (requester_user_id = target_user_id),
  CHECK (status = 'pending' OR reviewed_at IS NOT NULL)
);

CREATE UNIQUE INDEX account_merge_requests_pending_source
  ON account_merge_requests (source_user_id)
  WHERE status = 'pending';
CREATE UNIQUE INDEX account_merge_requests_pending_target
  ON account_merge_requests (target_user_id)
  WHERE status = 'pending';
CREATE INDEX account_merge_requests_status_created
  ON account_merge_requests (status, created_at DESC);
CREATE INDEX account_merge_requests_requester_created
  ON account_merge_requests (requester_user_id, created_at DESC);

COMMIT;
