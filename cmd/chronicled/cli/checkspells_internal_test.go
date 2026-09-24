package cli

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestParseDatasetSelection(t *testing.T) {
	t.Parallel()

	first := uuid.New()
	second := uuid.New()
	selected, err := parseDatasetSelection([]string{first.String(), second.String(), first.String()})
	require.NoError(t, err)
	require.Equal(t, map[uuid.UUID]struct{}{first: {}, second: {}}, selected)

	_, err = parseDatasetSelection([]string{"not-a-uuid"})
	require.ErrorContains(t, err, "invalid dataset UUID")
}
