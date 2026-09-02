package chroniclebot

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type recordingAuthorizer struct {
	writes   []rel.Txn
	writeErr error
}

func (a *recordingAuthorizer) Write(_ context.Context, txn rel.Txn) (string, error) {
	if a.writeErr != nil {
		return "", a.writeErr
	}
	a.writes = append(a.writes, txn)
	return "", nil
}

func (*recordingAuthorizer) Delete(context.Context, *rel.PreconditionedFilter) error {
	return nil
}

func TestAvailable(t *testing.T) {
	t.Parallel()

	require.False(t, (*Bot)(nil).Available())
	require.False(t, (&Bot{disabled: true}).Available())
	require.True(t, (&Bot{}).Available())
}

func TestEnsureProtectedTechnicalAdmin(t *testing.T) {
	t.Parallel()

	t.Run("protected user gets technical admin", func(t *testing.T) {
		userID := uuid.New()
		zed := &recordingAuthorizer{}

		err := ensureProtectedTechnicalAdmin(context.Background(), zed, protectedTechnicalAdminDiscordID, userID)
		require.NoError(t, err)
		require.Len(t, zed.writes, 1)

		expected := policy.New()
		expected.GlobalChronicle().Technical_admin(expected.User(userID))
		require.Equal(t, expected.Txn().V1Updates, zed.writes[0].V1Updates)
	})

	t.Run("other users are untouched", func(t *testing.T) {
		zed := &recordingAuthorizer{}

		err := ensureProtectedTechnicalAdmin(context.Background(), zed, "another-discord-user", uuid.New())
		require.NoError(t, err)
		require.Empty(t, zed.writes)
	})

	t.Run("write errors are returned", func(t *testing.T) {
		writeErr := errors.New("write failed")
		zed := &recordingAuthorizer{writeErr: writeErr}

		err := ensureProtectedTechnicalAdmin(context.Background(), zed, protectedTechnicalAdminDiscordID, uuid.New())
		require.ErrorIs(t, err, writeErr)
	})
}
