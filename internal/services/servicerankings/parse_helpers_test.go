package servicerankings

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestParseOptionalUUID(t *testing.T) {
	t.Parallel()

	t.Run("empty", func(t *testing.T) {
		t.Parallel()

		got, err := parseOptionalUUID("")
		require.NoError(t, err)
		require.False(t, got.Valid)
	})

	t.Run("valid", func(t *testing.T) {
		t.Parallel()

		id := uuid.New()
		got, err := parseOptionalUUID(id.String())
		require.NoError(t, err)
		require.True(t, got.Valid)
		require.Equal(t, id, got.UUID)
	})

	t.Run("invalid", func(t *testing.T) {
		t.Parallel()

		_, err := parseOptionalUUID("not-a-uuid")
		require.Error(t, err)
	})
}
