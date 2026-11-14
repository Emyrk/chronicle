package serviceblog

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestPostgresAdmissionAndLifecycle(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	user := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: user, Username: user.String()})
	require.NoError(t, err)
	tenant := uuid.New()
	_, err = db.InsertTenant(ctx, database.InsertTenantParams{ID: tenant, Name: tenant.String(), Branding: []byte(`{}`), ParseConfig: []byte(`{}`), ExternalLinking: []byte(`{}`), AvailableFormats: []string{}, AdditionalFlavor: []string{}, DisabledAds: []string{}})
	require.NoError(t, err)
	// PostgreSQL now() is transaction-stable, so exact empty-bucket retry duration
	// can be asserted without sleeps or mutating production limiter timestamps.
	err = db.InTx(ctx, func(tx database.Store) error {
		limit := ratelimit.Limit{PerSecond: 2.0 / 1200, Burst: 10}
		voteLimiter := ratelimit.New(tx, "blog_vote", limit)
		feedbackLimiter := ratelimit.New(tx, "blog_feedback", limit)
		require.Equal(t, limit, voteLimiter.Limit())
		require.Equal(t, limit, feedbackLimiter.Limit())
		s := New(Options{Store: NewDatabaseStore(tx), Bans: testBans{}, VoteLimiter: voteLimiter, FeedbackLimiter: feedbackLimiter, Eligible: func(context.Context, string, string) (bool, error) { return true, nil }})
		for i := 0; i < 10; i++ {
			require.NoError(t, s.Vote(ctx, fmt.Sprint("post", i), user, 1))
		}
		var limited *RateLimited
		require.ErrorAs(t, s.Vote(ctx, "another-post", user, -1), &limited)
		require.Equal(t, 600*time.Second, limited.Result.RetryAfter)
		// Feedback has its own full bucket despite exhausted votes. Submitting from
		// root and another tenant still shares the same ten-token account bucket.
		for i := 0; i < 10; i++ {
			origin := tenant
			if i%2 == 0 {
				origin = uuid.Nil
			}
			_, err := s.Save(ctx, fmt.Sprint("post", i), user, origin, "private", false)
			require.NoError(t, err)
		}
		_, err := s.Save(ctx, "eleventh", user, uuid.Nil, "private", false)
		require.ErrorAs(t, err, &limited)
		require.Equal(t, 600*time.Second, limited.Result.RetryAfter)
		stored, err := tx.GetBlogFeedback(ctx, database.GetBlogFeedbackParams{PostSlug: "post0", UserID: user})
		require.NoError(t, err)
		require.False(t, stored.OriginalTenantID.Valid)
		stored, err = tx.GetBlogFeedback(ctx, database.GetBlogFeedbackParams{PostSlug: "post1", UserID: user})
		require.NoError(t, err)
		require.Equal(t, tenant, stored.OriginalTenantID.UUID)
		// Refund explicitly through the production limiter API for lifecycle checks.
		_, err = feedbackLimiter.Refund(ctx, ratelimit.UserSubject(user.String()), 5)
		require.NoError(t, err)
		edited, err := s.Save(ctx, "post1", user, uuid.Nil, "public", true)
		require.NoError(t, err)
		require.Equal(t, tenant, edited.TenantID)
		require.True(t, edited.Consent)
		require.NoError(t, s.Moderate(ctx, edited.ID, "approve", edited.UpdatedAt))
		public, err := s.opts.Store.PublicFeedback(ctx, "post1")
		require.NoError(t, err)
		require.Len(t, public, 1)
		edited, err = s.Save(ctx, "post1", user, uuid.Nil, "private again", false)
		require.NoError(t, err)
		require.Equal(t, "pending", edited.Status)
		require.Equal(t, tenant, edited.TenantID)
		public, err = s.opts.Store.PublicFeedback(ctx, "post1")
		require.NoError(t, err)
		require.Empty(t, public)
		require.NoError(t, s.Delete(ctx, "post1", user))
		_, err = s.Save(ctx, "post1", user, tenant, "recreate", false)
		require.ErrorIs(t, err, ErrReserved)
		return nil
	}, nil)
	require.NoError(t, err)
}

func TestPostgresAdminListIncludesOlderTombstones(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	user := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: user, Username: user.String()})
	require.NoError(t, err)
	store := NewDatabaseStore(db)
	oldest, _, err := store.SaveFeedback(ctx, Feedback{PostSlug: "oldest", UserID: user, Body: "old", Consent: false})
	require.NoError(t, err)
	require.NoError(t, store.DeleteOwnFeedback(ctx, "oldest", user))
	require.NoError(t, db.InTx(ctx, func(tx database.Store) error {
		for i := 0; i < 1001; i++ {
			_, err := tx.InsertBlogFeedback(ctx, database.InsertBlogFeedbackParams{PostSlug: fmt.Sprintf("post-%04d", i), UserID: user, Body: pgtype.Text{String: "private", Valid: true}})
			if err != nil {
				return err
			}
		}
		return nil
	}, nil))
	rows, err := store.ListFeedback(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 1002)
	seen := make(map[uuid.UUID]bool, len(rows))
	found := false
	for _, row := range rows {
		require.False(t, seen[row.ID])
		seen[row.ID] = true
		if row.ID == oldest.ID {
			require.True(t, row.Deleted)
			found = true
		}
	}
	require.True(t, found, "oldest tombstone must remain available to moderators")
	require.Equal(t, user.String(), rows[0].AuthorUsername)
	require.Empty(t, rows[0].AuthorDiscordID)

	_, err = db.InsertUserAuth(ctx, database.InsertUserAuthParams{ID: uuid.New(), LinkedID: "123456789012345678", UserID: user, Provider: "discord"})
	require.NoError(t, err)
	rows, err = store.ListFeedback(ctx)
	require.NoError(t, err)
	require.Equal(t, "123456789012345678", rows[0].AuthorDiscordID)
}

func TestPostgresSummariesArePublicAndEligible(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	users := make([]uuid.UUID, 4)
	for i := range users {
		users[i] = uuid.New()
		_, err := db.InsertUser(ctx, database.InsertUserParams{ID: users[i], Username: users[i].String()})
		require.NoError(t, err)
	}
	vote := func(slug string, user uuid.UUID, value int16) {
		_, err := db.UpsertBlogVote(ctx, database.UpsertBlogVoteParams{PostSlug: slug, UserID: user, Value: value})
		require.NoError(t, err)
	}
	feedback := func(slug string, user uuid.UUID, consent bool, status string) {
		row, err := db.InsertBlogFeedback(ctx, database.InsertBlogFeedbackParams{PostSlug: slug, UserID: user, Body: pgtype.Text{String: "hi", Valid: true}, PublicConsent: consent})
		require.NoError(t, err)
		if status != "pending" {
			_, err = db.ModerateBlogFeedback(ctx, database.ModerateBlogFeedbackParams{ID: row.ID, Status: status, ExpectedUpdatedAt: row.UpdatedAt})
			require.NoError(t, err)
		}
	}
	vote("alpha", users[0], 1)
	vote("alpha", users[1], 1)
	vote("alpha", users[2], -1)
	feedback("alpha", users[0], true, "approved")
	feedback("alpha", users[1], false, "approved") // private
	feedback("alpha", users[2], true, "pending")   // unmoderated
	vote("beta", users[0], -1)                     // downvotes alone show nothing
	vote("gamma", users[0], 1)
	feedback("gamma", users[0], true, "approved")

	// Feedback is disabled for gamma in this context.
	s := New(Options{Store: NewDatabaseStore(db), Eligible: func(_ context.Context, slug string, kind string) (bool, error) {
		return slug != "gamma" || kind == "vote", nil
	}})
	summaries, err := s.Summaries(ctx)
	require.NoError(t, err)
	require.Equal(t, []Summary{
		{Slug: "alpha", UpVotes: 2, PublicFeedback: 1},
		{Slug: "gamma", UpVotes: 1},
	}, summaries)
}
