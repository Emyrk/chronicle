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
SELECT * FROM blog_feedback
WHERE (@post_slug::text = '' OR post_slug = @post_slug)
  AND (@status::text = '' OR status = @status)
ORDER BY created_at DESC, id LIMIT @limit_count::int OFFSET @offset_count::int;
