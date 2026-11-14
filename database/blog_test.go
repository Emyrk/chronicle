package database_test

import (
	"strings"
	"sync"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestBlogFeedbackLifecycle(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	user := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: user, Username: user.String()})
	require.NoError(t, err)
	input := database.InsertBlogFeedbackParams{PostSlug: "post", UserID: user, Body: pgtype.Text{String: "世界", Valid: true}, PublicConsent: true}
	row, err := db.InsertBlogFeedback(ctx, input)
	require.NoError(t, err)
	require.Equal(t, "pending", row.Status)
	list := database.ListPublicBlogFeedbackParams{PostSlug: "post", LimitCount: 100}
	rows, err := db.ListPublicBlogFeedback(ctx, list)
	require.NoError(t, err)
	require.Empty(t, rows)
	_, err = db.ModerateBlogFeedback(ctx, database.ModerateBlogFeedbackParams{ID: row.ID, Status: "approved", ExpectedUpdatedAt: row.UpdatedAt})
	require.NoError(t, err)
	rows, err = db.ListPublicBlogFeedback(ctx, list)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	edited, err := db.UpdateBlogFeedback(ctx, database.UpdateBlogFeedbackParams{PostSlug: "post", UserID: user, Body: input.Body, PublicConsent: false})
	require.NoError(t, err)
	require.Equal(t, "pending", edited.Status)
	_, err = db.ModerateBlogFeedback(ctx, database.ModerateBlogFeedbackParams{ID: row.ID, Status: "approved", ExpectedUpdatedAt: row.UpdatedAt})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	row = edited
	_, err = db.ModerateBlogFeedback(ctx, database.ModerateBlogFeedbackParams{ID: row.ID, Status: "approved", ExpectedUpdatedAt: row.UpdatedAt})
	require.NoError(t, err)
	rows, err = db.ListPublicBlogFeedback(ctx, list)
	require.NoError(t, err)
	require.Empty(t, rows)
	deleted, err := db.DeleteBlogFeedback(ctx, database.DeleteBlogFeedbackParams{PostSlug: "post", UserID: user})
	require.NoError(t, err)
	require.False(t, deleted.Body.Valid)
	require.True(t, deleted.DeletedAt.Valid)
	require.Equal(t, user, deleted.UserID)
	_, err = db.InsertBlogFeedback(ctx, input)
	var pgerr *pgconn.PgError
	require.ErrorAs(t, err, &pgerr)
	require.Equal(t, "23505", pgerr.Code)
	_, err = db.UpdateBlogFeedback(ctx, database.UpdateBlogFeedbackParams{PostSlug: "post", UserID: user, Body: input.Body})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = db.ModerateBlogFeedback(ctx, database.ModerateBlogFeedbackParams{ID: row.ID, Status: "approved", ExpectedUpdatedAt: row.UpdatedAt})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	reserved, err := db.GetBlogFeedback(ctx, database.GetBlogFeedbackParams{PostSlug: "post", UserID: user})
	require.NoError(t, err)
	require.Equal(t, row.ID, reserved.ID)
	rows, err = db.ListAdminBlogFeedback(ctx, database.ListAdminBlogFeedbackParams{LimitCount: 100})
	require.NoError(t, err)
	require.Len(t, rows, 1)
}

func TestBlogConstraintsAndVotes(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	user := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: user, Username: user.String()})
	require.NoError(t, err)
	for _, body := range []string{"", " ", "\ttext", "text\n", "\u00a0text", "text\u3000", strings.Repeat("界", 301)} {
		_, err = db.InsertBlogFeedback(ctx, database.InsertBlogFeedbackParams{PostSlug: uuid.NewString(), UserID: user, Body: pgtype.Text{String: body, Valid: true}})
		var pgerr *pgconn.PgError
		require.ErrorAs(t, err, &pgerr)
		require.Equal(t, "23514", pgerr.Code)
	}
	row, err := db.InsertBlogFeedback(ctx, database.InsertBlogFeedbackParams{PostSlug: "unicode", UserID: user, Body: pgtype.Text{String: strings.Repeat("界", 300), Valid: true}})
	require.NoError(t, err)
	_, err = db.ModerateBlogFeedback(ctx, database.ModerateBlogFeedbackParams{ID: row.ID, Status: "invalid", ExpectedUpdatedAt: row.UpdatedAt})
	require.Error(t, err)
	_, err = db.InsertBlogFeedback(ctx, database.InsertBlogFeedbackParams{PostSlug: "null", UserID: user})
	require.Error(t, err)
	_, err = db.UpsertBlogVote(ctx, database.UpsertBlogVoteParams{PostSlug: "post", UserID: user, Value: 0})
	require.Error(t, err)
	for _, value := range []int16{1, -1, 1} {
		_, err = db.UpsertBlogVote(ctx, database.UpsertBlogVoteParams{PostSlug: "post", UserID: user, Value: value})
		require.NoError(t, err)
		totals, err := db.GetBlogVoteTotals(ctx, "post")
		require.NoError(t, err)
		require.Equal(t, int64(1), totals.Upvotes+totals.Downvotes)
		require.Equal(t, value == 1, totals.Upvotes == 1)
	}
	err = db.DeleteBlogVote(ctx, database.DeleteBlogVoteParams{PostSlug: "post", UserID: user})
	require.NoError(t, err)
	totals, err := db.GetBlogVoteTotals(ctx, "post")
	require.NoError(t, err)
	require.Zero(t, totals.Upvotes+totals.Downvotes)
}

// Revisions must change even inside one transaction, where now() is constant.
func TestBlogFeedbackRevisionInTransaction(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	user := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: user, Username: user.String()})
	require.NoError(t, err)
	err = db.InTx(ctx, func(tx database.Store) error {
		row, err := tx.InsertBlogFeedback(ctx, database.InsertBlogFeedbackParams{PostSlug: "revision", UserID: user, Body: pgtype.Text{String: "before", Valid: true}, PublicConsent: true})
		if err != nil {
			return err
		}
		edited, err := tx.UpdateBlogFeedback(ctx, database.UpdateBlogFeedbackParams{PostSlug: "revision", UserID: user, Body: pgtype.Text{String: "after", Valid: true}, PublicConsent: true})
		if err != nil {
			return err
		}
		require.True(t, edited.UpdatedAt.Time.After(row.UpdatedAt.Time))
		_, err = tx.ModerateBlogFeedback(ctx, database.ModerateBlogFeedbackParams{ID: row.ID, Status: "approved", ExpectedUpdatedAt: row.UpdatedAt})
		require.ErrorIs(t, err, pgx.ErrNoRows)
		_, err = tx.ModerateBlogFeedback(ctx, database.ModerateBlogFeedbackParams{ID: row.ID, Status: "approved", ExpectedUpdatedAt: edited.UpdatedAt})
		return err
	}, nil)
	require.NoError(t, err)
}

func TestBlogConcurrentUniqueness(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	user := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: user, Username: user.String()})
	require.NoError(t, err)
	const writers = 8
	start := make(chan struct{})
	feedbackErrors := make(chan error, writers)
	voteErrors := make(chan error, writers)
	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, err := db.InsertBlogFeedback(ctx, database.InsertBlogFeedbackParams{PostSlug: "concurrent", UserID: user, Body: pgtype.Text{String: "feedback", Valid: true}})
			feedbackErrors <- err
			value := int16(1)
			if i%2 == 0 {
				value = -1
			}
			_, err = db.UpsertBlogVote(ctx, database.UpsertBlogVoteParams{PostSlug: "concurrent", UserID: user, Value: value})
			voteErrors <- err
		}(i)
	}
	close(start)
	wg.Wait()
	close(feedbackErrors)
	close(voteErrors)
	successes := 0
	for err := range feedbackErrors {
		if err == nil {
			successes++
			continue
		}
		var pgerr *pgconn.PgError
		require.ErrorAs(t, err, &pgerr)
		require.Equal(t, "23505", pgerr.Code)
	}
	require.Equal(t, 1, successes)
	for err := range voteErrors {
		require.NoError(t, err)
	}
	rows, err := db.ListAdminBlogFeedback(ctx, database.ListAdminBlogFeedbackParams{PostSlug: "concurrent", LimitCount: 100})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	totals, err := db.GetBlogVoteTotals(ctx, "concurrent")
	require.NoError(t, err)
	require.Equal(t, int64(1), totals.Upvotes+totals.Downvotes)
}
