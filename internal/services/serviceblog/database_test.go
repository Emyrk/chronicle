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
		limit := ratelimit.Limit{PerSecond: 1.0 / 1200, Burst: 5}
		voteLimiter := ratelimit.New(tx, "blog_vote", limit)
		feedbackLimiter := ratelimit.New(tx, "blog_feedback", limit)
		require.Equal(t, limit, voteLimiter.Limit())
		require.Equal(t, limit, feedbackLimiter.Limit())
		s := New(Options{Store: NewDatabaseStore(tx), Bans: testBans{}, VoteLimiter: voteLimiter, FeedbackLimiter: feedbackLimiter, Eligible: func(context.Context, string, string) (bool, error) { return true, nil }})
		for i := 0; i < 5; i++ {
			require.NoError(t, s.Vote(ctx, fmt.Sprint("post", i), user, 1))
		}
		var limited *RateLimited
		require.ErrorAs(t, s.Vote(ctx, "another-post", user, -1), &limited)
		require.Equal(t, 1200*time.Second, limited.Result.RetryAfter)
		// Feedback has its own full bucket despite exhausted votes. Submitting from
		// root and another tenant still shares the same five-token account bucket.
		for i := 0; i < 5; i++ {
			origin := tenant
			if i%2 == 0 {
				origin = uuid.Nil
			}
			_, err := s.Save(ctx, fmt.Sprint("post", i), user, origin, "private", false)
			require.NoError(t, err)
		}
		_, err := s.Save(ctx, "sixth", user, uuid.Nil, "private", false)
		require.ErrorAs(t, err, &limited)
		require.Equal(t, 1200*time.Second, limited.Result.RetryAfter)
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
