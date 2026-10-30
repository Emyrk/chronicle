BEGIN;

-- account_purges tracks self-service account deletion jobs. user_id has no
-- foreign key so the row, and its status, outlive the deleted account.
CREATE TABLE account_purges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  step text NOT NULL DEFAULT '',
  logs_total integer NOT NULL DEFAULT 0,
  logs_deleted integer NOT NULL DEFAULT 0,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE UNIQUE INDEX account_purges_active_user
  ON account_purges (user_id)
  WHERE status IN ('pending', 'running');

COMMIT;
