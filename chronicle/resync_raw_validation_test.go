package chronicle

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestValidateResyncRawFiles(t *testing.T) {
	t.Parallel()

	firstID := uuid.New()
	secondID := uuid.New()
	files := []database.LogFile{{ID: firstID}, {ID: secondID}}

	t.Run("rejects unexpected file count before loading", func(t *testing.T) {
		t.Parallel()

		loads := 0
		err := validateResyncRawFiles(t.Context(), files[:1], 2, func(context.Context, database.LogFile) ([]byte, error) {
			loads++
			return []byte("log"), nil
		})
		require.ErrorContains(t, err, "expected 2 files, found 1")
		require.Zero(t, loads)
	})

	t.Run("rejects an unreadable file", func(t *testing.T) {
		t.Parallel()

		unavailable := errors.New("object unavailable")
		var loaded []uuid.UUID
		err := validateResyncRawFiles(t.Context(), files, 2, func(_ context.Context, file database.LogFile) ([]byte, error) {
			loaded = append(loaded, file.ID)
			if file.ID == secondID {
				return nil, unavailable
			}
			return []byte("log"), nil
		})
		require.ErrorIs(t, err, unavailable)
		require.ErrorContains(t, err, secondID.String())
		require.Equal(t, []uuid.UUID{firstID, secondID}, loaded)
	})

	t.Run("loads every file", func(t *testing.T) {
		t.Parallel()

		var loaded []uuid.UUID
		err := validateResyncRawFiles(t.Context(), files, 2, func(_ context.Context, file database.LogFile) ([]byte, error) {
			loaded = append(loaded, file.ID)
			return []byte("log"), nil
		})
		require.NoError(t, err)
		require.Equal(t, []uuid.UUID{firstID, secondID}, loaded)
	})
}
