package database_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/aikey"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestAIKeys(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "ai-key-" + userID.String()[:8]})
	require.NoError(t, err)
	root := aikey.TenantScope(uuid.Nil)
	insert := func(secret string) (database.AiKey, error) {
		return store.InsertAIKey(ctx, database.InsertAIKeyParams{
			ID: uuid.New(), UserID: userID, HashedSecret: aikey.Hash(secret),
			ExpiresAt: database.Timestamptz(time.Now().Add(time.Hour)),
		})
	}

	firstSecret, err := aikey.Generate()
	require.NoError(t, err)
	secondSecret, err := aikey.Generate()
	require.NoError(t, err)
	first, err := insert(firstSecret)
	require.NoError(t, err)
	require.False(t, first.TenantID.Valid)
	require.Equal(t, root, first.TenantScopeID)

	// One unrevoked key per user per community.
	_, err = insert(secondSecret)
	require.True(t, database.IsUniqueViolation(err, database.UniqueAiKeysOneUnrevokedPerUserTenant), err)

	got, err := store.GetUnrevokedAIKey(ctx, database.GetUnrevokedAIKeyParams{UserID: userID, TenantScopeID: root})
	require.NoError(t, err)
	require.Equal(t, first.ID, got.ID)

	require.NoError(t, store.TouchAIKey(ctx, database.TouchAIKeyParams{ID: first.ID, LastUserAgent: "Claude-User"}))
	got, err = store.GetAIKeyByHashedSecret(ctx, aikey.Hash(firstSecret))
	require.NoError(t, err)
	require.Equal(t, int64(1), got.RequestCount)
	require.Equal(t, "Claude-User", got.LastUserAgent)
	require.True(t, got.LastUsedAt.Valid)

	// Rotating revokes the old key; it stays findable so it can be told apart
	// from a wrong key.
	n, err := store.RevokeAIKeys(ctx, database.RevokeAIKeysParams{UserID: userID, TenantScopeID: root})
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
	second, err := insert(secondSecret)
	require.NoError(t, err)
	got, err = store.GetUnrevokedAIKey(ctx, database.GetUnrevokedAIKeyParams{UserID: userID, TenantScopeID: root})
	require.NoError(t, err)
	require.Equal(t, second.ID, got.ID)
	old, err := store.GetAIKeyByHashedSecret(ctx, aikey.Hash(firstSecret))
	require.NoError(t, err)
	require.True(t, old.RevokedAt.Valid)
}
