package database_test

import (
	"bytes"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestUserAPIKeys(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "api-key-user",
		Email:    "api-key-user@example.com",
	})
	require.NoError(t, err)

	createdAt := time.Now().Add(-time.Hour).Truncate(time.Microsecond)
	keyID := uuid.New()
	hash := bytes.Repeat([]byte{0x42}, 32)
	created, err := db.InsertUserAPIKey(ctx, database.InsertUserAPIKeyParams{
		ID:        keyID,
		UserID:    userID,
		Name:      "guild scraper",
		KeyHash:   hash,
		CreatedAt: database.Timestamptz(createdAt),
	})
	require.NoError(t, err)
	require.Equal(t, keyID, created.ID)
	require.Equal(t, "guild scraper", created.Name)
	require.False(t, created.LastUsedAt.Valid)

	found, err := db.GetUserAPIKeyByHash(ctx, hash)
	require.NoError(t, err)
	require.Equal(t, keyID, found.ID)

	keys, err := db.ListUserAPIKeys(ctx, userID)
	require.NoError(t, err)
	require.Len(t, keys, 1)

	count, err := db.CountUserAPIKeys(ctx, userID)
	require.NoError(t, err)
	require.EqualValues(t, 1, count)

	usedAt := time.Now().Truncate(time.Microsecond)
	err = db.TouchUserAPIKeyLastUsed(ctx, database.TouchUserAPIKeyLastUsedParams{
		LastUsedAt:     database.Timestamptz(usedAt),
		ID:             keyID,
		LastUsedBefore: database.Timestamptz(usedAt.Add(-time.Minute)),
	})
	require.NoError(t, err)
	found, err = db.GetUserAPIKeyByHash(ctx, hash)
	require.NoError(t, err)
	require.True(t, found.LastUsedAt.Valid)
	require.WithinDuration(t, usedAt, found.LastUsedAt.Time, time.Millisecond)

	deleted, err := db.DeleteUserAPIKey(ctx, database.DeleteUserAPIKeyParams{ID: keyID, UserID: userID})
	require.NoError(t, err)
	require.EqualValues(t, 1, deleted)
	count, err = db.CountUserAPIKeys(ctx, userID)
	require.NoError(t, err)
	require.Zero(t, count)
}
