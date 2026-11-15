-- name: UpsertBlogVote :one
INSERT INTO blog_votes (post_slug, user_id, value)
VALUES (@post_slug, @user_id, @value)
ON CONFLICT (post_slug, user_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
RETURNING *;

-- name: DeleteBlogVote :exec
DELETE FROM blog_votes WHERE post_slug = @post_slug AND user_id = @user_id;

-- name: GetBlogVote :one
SELECT * FROM blog_votes WHERE post_slug = @post_slug AND user_id = @user_id;

-- name: GetBlogVoteTotals :one
SELECT count(*) FILTER (WHERE value = 1) AS upvotes,
       count(*) FILTER (WHERE value = -1) AS downvotes
FROM blog_votes WHERE post_slug = @post_slug;

-- name: InsertBlogFeedback :one
INSERT INTO blog_feedback (post_slug, user_id, original_tenant_id, body, public_consent)
VALUES (@post_slug, @user_id, sqlc.narg(original_tenant_id), sqlc.narg(body), @public_consent)
RETURNING *;

-- name: UpdateBlogFeedback :one
UPDATE blog_feedback SET body = sqlc.narg(body), public_consent = @public_consent,
  status = 'pending', updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')
WHERE post_slug = @post_slug AND user_id = @user_id AND deleted_at IS NULL
RETURNING *;

-- name: DeleteBlogFeedback :one
UPDATE blog_feedback SET body = NULL, public_consent = false, status = 'pending',
  deleted_at = now(), updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')
WHERE post_slug = @post_slug AND user_id = @user_id AND deleted_at IS NULL
RETURNING *;

-- name: GetBlogFeedback :one
SELECT * FROM blog_feedback WHERE post_slug = @post_slug AND user_id = @user_id;

-- name: GetBlogFeedbackByID :one
SELECT * FROM blog_feedback WHERE id = @id;

-- name: ModerateBlogFeedback :one
-- Guard the exact revision the moderator reviewed, not a newly fetched revision.
UPDATE blog_feedback SET status = @status,
  updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')
WHERE id = @id AND deleted_at IS NULL AND updated_at = @expected_updated_at
RETURNING *;

-- name: ListPublicBlogFeedback :many
SELECT * FROM blog_feedback
WHERE post_slug = @post_slug AND status = 'approved' AND public_consent AND deleted_at IS NULL
ORDER BY created_at, id LIMIT @limit_count::int OFFSET @offset_count::int;

-- name: ListAdminBlogFeedback :many
-- Moderator-only: includes the author's username and linked Discord ID.
SELECT sqlc.embed(blog_feedback),
       COALESCE(users.username, '')::text AS author_username,
       COALESCE(discord_auth.linked_id, '')::text AS author_discord_id
FROM blog_feedback
LEFT JOIN users ON users.id = blog_feedback.user_id
LEFT JOIN LATERAL (
  SELECT linked_id FROM user_auth_links
  WHERE user_auth_links.user_id = blog_feedback.user_id AND provider = 'discord'
  ORDER BY created_at LIMIT 1
) AS discord_auth ON true
WHERE (@post_slug::text = '' OR blog_feedback.post_slug = @post_slug)
  AND (@status::text = '' OR blog_feedback.status = @status)
ORDER BY blog_feedback.created_at DESC, blog_feedback.id LIMIT @limit_count::int OFFSET @offset_count::int;

-- name: ListBlogInteractionSummaries :many
-- Public totals only: upvotes and approved, consented, undeleted feedback. Never downvotes.
SELECT s.post_slug::text AS post_slug,
       sum(s.upvotes)::bigint AS upvotes,
       sum(s.public_feedback)::bigint AS public_feedback
FROM (
  SELECT post_slug, count(*) AS upvotes, 0::bigint AS public_feedback
  FROM blog_votes WHERE value = 1 GROUP BY post_slug
  UNION ALL
  SELECT post_slug, 0::bigint, count(*)
  FROM blog_feedback WHERE status = 'approved' AND public_consent AND deleted_at IS NULL GROUP BY post_slug
) s
GROUP BY s.post_slug
ORDER BY s.post_slug;

-- name: ClaimBlogVoteReward :execrows
-- Existing votes predate rewards and are not new interactions. Record their
-- reservation too, so removing and recreating them cannot earn a reward.
INSERT INTO blog_vote_reward_receipts (user_id, post_slug)
SELECT @user_id, @post_slug
WHERE NOT @removing::boolean OR EXISTS (
  SELECT 1 FROM blog_votes WHERE user_id = @user_id AND post_slug = @post_slug
)
ON CONFLICT DO NOTHING;

-- name: GetBlogRewardState :one
SELECT
  NOT EXISTS (SELECT 1 FROM blog_vote_reward_receipts WHERE blog_vote_reward_receipts.user_id = @user_id AND blog_vote_reward_receipts.post_slug = @post_slug)
    AND NOT EXISTS (SELECT 1 FROM blog_votes WHERE blog_votes.user_id = @user_id AND blog_votes.post_slug = @post_slug) AS vote_eligible,
  NOT EXISTS (SELECT 1 FROM blog_feedback WHERE blog_feedback.user_id = @user_id AND blog_feedback.post_slug = @post_slug) AS feedback_eligible,
  (SELECT expires_at FROM data_grants WHERE data_grants.user_id = @user_id AND source = 'blog-vote') AS vote_expires_at,
  (SELECT expires_at FROM data_grants WHERE data_grants.user_id = @user_id AND source = 'blog-feedback') AS feedback_expires_at;
