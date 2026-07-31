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
	require.Equal(t, int64(75_000_000), grant.StorageBytes)
	require.Equal(t, checkedAt.Add(14*24*time.Hour), grant.ExpiresAt.Time)
}
