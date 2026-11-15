package storagegrants

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDiscordMemberStorageGrant(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	checkedAt := time.Date(2026, time.July, 31, 12, 0, 0, 0, time.UTC)
	grant := DiscordMemberStorageGrant(userID, checkedAt)

	require.Equal(t, userID, grant.UserID)
	require.Equal(t, DiscordMemberSource, grant.Source)
	require.Equal(t, int64(50_000_000), grant.StorageBytes)
	require.Equal(t, checkedAt.Add(14*24*time.Hour), grant.ExpiresAt.Time)
}

func TestBlogStorageGrants(t *testing.T) {
	t.Parallel()
	user := uuid.New()
	now := time.Date(2026, time.July, 31, 12, 0, 0, 0, time.UTC)
	vote := BlogVoteStorageGrant(user, now)
	feedback := BlogFeedbackStorageGrant(user, now)
	require.Equal(t, user, vote.UserID)
	require.Equal(t, user, feedback.UserID)
	require.Equal(t, "blog-vote", vote.Source)
	require.Equal(t, "blog-feedback", feedback.Source)
	require.EqualValues(t, 2_000_000, vote.StorageBytes)
	require.EqualValues(t, 5_000_000, feedback.StorageBytes)
	require.Equal(t, now.Add(60*24*time.Hour), vote.ExpiresAt.Time)
	require.Equal(t, now.Add(60*24*time.Hour), feedback.ExpiresAt.Time)
	require.True(t, vote.ExpiresAt.Valid)
	require.True(t, feedback.ExpiresAt.Valid)
}
