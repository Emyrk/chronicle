BEGIN;
-- Retain eligibility after a vote is removed. No historical data backfill.
CREATE TABLE blog_vote_reward_receipts (
  user_id uuid NOT NULL REFERENCES users(id),
  post_slug text NOT NULL,
  PRIMARY KEY (user_id, post_slug)
);
COMMIT;
