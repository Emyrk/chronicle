package serviceblog

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/storagegrants"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestBlogStorageRewards(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	user := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: user, Username: user.String()})
	require.NoError(t, err)
	store := NewDatabaseStore(db).(*databaseStore)
	vote, feedback, err := store.Rewards(ctx, "first", user)
	require.NoError(t, err)
	require.True(t, vote.Eligible)
	require.True(t, feedback.Eligible)
	require.Nil(t, vote.ExpiresAt)
	// Removing an absent vote does not consume eligibility.
	require.NoError(t, store.SetVote(ctx, "first", user, 0))
	before := time.Now()
	require.NoError(t, store.SetVote(ctx, "first", user, -1))
	_, created, err := store.SaveFeedback(ctx, Feedback{PostSlug: "first", UserID: user, Body: "private feedback"})
	require.NoError(t, err)
	require.True(t, created)
	grants, err := activeBlogGrants(ctx, db, user)
	require.NoError(t, err)
	require.Len(t, grants, 2)
	var total int64
	for _, grant := range grants {
		total += grant.StorageBytes
		require.EqualValues(t, map[string]int64{storagegrants.BlogVoteSource: 2_000_000, storagegrants.BlogFeedbackSource: 5_000_000}[grant.Source], grant.StorageBytes)
		require.WithinRange(t, grant.ExpiresAt.Time, before.Add(storagegrants.BlogRewardDuration), time.Now().Add(storagegrants.BlogRewardDuration))
	}
	require.EqualValues(t, 7_000_000, total)
	// Set exact past expiries without sleeping. Repeats must not revive them.
	expired := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, params := range []database.UpsertDataGrantParams{
		storagegrants.BlogVoteStorageGrant(user, expired.Add(-storagegrants.BlogRewardDuration)),
		storagegrants.BlogFeedbackStorageGrant(user, expired.Add(-storagegrants.BlogRewardDuration)),
	} {
		_, err = db.UpsertDataGrant(ctx, params)
		require.NoError(t, err)
	}
	require.NoError(t, store.SetVote(ctx, "first", user, 1))
	require.NoError(t, store.SetVote(ctx, "first", user, 0))
	require.NoError(t, store.SetVote(ctx, "first", user, -1))
	_, created, err = store.SaveFeedback(ctx, Feedback{PostSlug: "first", UserID: user, Body: "edited"})
	require.NoError(t, err)
	require.False(t, created)
	require.NoError(t, store.DeleteOwnFeedback(ctx, "first", user))
	_, _, err = store.SaveFeedback(ctx, Feedback{PostSlug: "first", UserID: user, Body: "recreated"})
	require.ErrorIs(t, err, ErrReserved)
	vote, feedback, err = store.Rewards(ctx, "first", user)
	require.NoError(t, err)
	require.False(t, vote.Eligible)
	require.False(t, feedback.Eligible)
	require.True(t, expired.Equal(*vote.ExpiresAt))
	require.True(t, expired.Equal(*feedback.ExpiresAt))
	grants, err = activeBlogGrants(ctx, db, user)
	require.NoError(t, err)
	require.Empty(t, grants, "expired bonuses must not contribute to quota")
	// A different post renews each category independently, not bytes or duration.
	before = time.Now()
	require.NoError(t, store.SetVote(ctx, "second", user, 1))
	vote, feedback, err = store.Rewards(ctx, "second", user)
	require.NoError(t, err)
	require.WithinRange(t, *vote.ExpiresAt, before.Add(storagegrants.BlogRewardDuration), time.Now().Add(storagegrants.BlogRewardDuration))
	require.True(t, expired.Equal(*feedback.ExpiresAt))
	_, _, err = store.SaveFeedback(ctx, Feedback{PostSlug: "second", UserID: user, Body: "another"})
	require.NoError(t, err)
	grants, err = activeBlogGrants(ctx, db, user)
	require.NoError(t, err)
	require.Len(t, grants, 2)
	total = 0
	for _, grant := range grants {
		total += grant.StorageBytes
	}
	require.EqualValues(t, 7_000_000, total)
	// Refreshing while still active never adds days onto the existing expiry.
	before = time.Now()
	require.NoError(t, store.SetVote(ctx, "third", user, 1))
	_, _, err = store.SaveFeedback(ctx, Feedback{PostSlug: "third", UserID: user, Body: "third"})
	require.NoError(t, err)
	vote, feedback, err = store.Rewards(ctx, "third", user)
	require.NoError(t, err)
	for _, expiry := range []*time.Time{vote.ExpiresAt, feedback.ExpiresAt} {
		require.WithinRange(t, *expiry, before.Add(storagegrants.BlogRewardDuration), time.Now().Add(storagegrants.BlogRewardDuration))
	}
	// Reward state uses the same privacy gates as the corresponding interaction.
	service := New(Options{Store: store, Bans: testBans{}, Eligible: func(context.Context, string, string) (bool, error) { return true, nil }})
	for _, access := range []struct{ vote, feedback bool }{{false, false}, {true, false}, {false, true}, {true, true}} {
		state, err := service.ReadWithAccess(ctx, "first", user, access.vote, access.feedback)
		require.NoError(t, err)
		require.Equal(t, access.vote, state.VoteReward != nil)
		require.Equal(t, access.feedback, state.FeedbackReward != nil)
	}
	state, err := service.Read(ctx, "first", uuid.Nil)
	require.NoError(t, err)
	require.Nil(t, state.VoteReward)
	require.Nil(t, state.FeedbackReward)

}

var errGrant = errors.New("grant write failed")

type failingGrantStore struct{ database.Store }

func (f failingGrantStore) InTx(ctx context.Context, fn func(database.Store) error, opts *pgx.TxOptions) error {
	return f.Store.InTx(ctx, func(tx database.Store) error { return fn(failingGrantStore{tx}) }, opts)
}
func (f failingGrantStore) UpsertDataGrant(context.Context, database.UpsertDataGrantParams) (database.DataGrant, error) {
	return database.DataGrant{}, errGrant
}

func TestBlogRewardFailureRollsBackInteraction(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	user := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: user, Username: user.String()})
	require.NoError(t, err)
	failing := NewDatabaseStore(failingGrantStore{db})
	require.ErrorIs(t, failing.SetVote(ctx, "post", user, 1), errGrant)
	_, _, err = failing.SaveFeedback(ctx, Feedback{PostSlug: "post", UserID: user, Body: "hello"})
	require.ErrorIs(t, err, errGrant)
	store := NewDatabaseStore(db).(*databaseStore)
	votes, err := store.Votes(ctx, "post", user)
	require.NoError(t, err)
	require.Zero(t, votes.Own)
	own, err := store.OwnFeedback(ctx, "post", user)
	require.NoError(t, err)
	require.Nil(t, own)
	vote, feedback, err := store.Rewards(ctx, "post", user)
	require.NoError(t, err)
	require.True(t, vote.Eligible, "receipt must roll back too")
	require.True(t, feedback.Eligible)
	require.NoError(t, store.SetVote(ctx, "post", user, 1))
	_, _, err = store.SaveFeedback(ctx, Feedback{PostSlug: "post", UserID: user, Body: "retry"})
	require.NoError(t, err)
}

func TestLegacyBlogVotesDoNotEarnRewards(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	user := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: user, Username: user.String()})
	require.NoError(t, err)
	store := NewDatabaseStore(db)
	for _, slug := range []string{"toggle-first", "remove-first"} {
		_, err = db.UpsertBlogVote(ctx, database.UpsertBlogVoteParams{PostSlug: slug, UserID: user, Value: 1})
		require.NoError(t, err)
		if slug == "toggle-first" {
			require.NoError(t, store.SetVote(ctx, slug, user, -1))
		}
		require.NoError(t, store.SetVote(ctx, slug, user, 0))
		require.NoError(t, store.SetVote(ctx, slug, user, 1))
	}
	grants, err := activeBlogGrants(ctx, db, user)
	require.NoError(t, err)
	require.Empty(t, grants)
}

func activeBlogGrants(ctx context.Context, db database.Store, user uuid.UUID) ([]database.DataGrant, error) {
	grants, err := db.GetUserDataGrants(ctx, user)
	return slices.DeleteFunc(grants, func(g database.DataGrant) bool {
		return g.Source != storagegrants.BlogVoteSource && g.Source != storagegrants.BlogFeedbackSource
	}), err
}
