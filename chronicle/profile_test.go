package chronicle

import (
	"testing"

	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseCombatLogWithCPUProfile(t *testing.T) {
	st, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)

	parent := &Chronicle{Storage: st}
	worker := &WorkerLogParse{parent: parent}
	logID := uuid.New()
	expected := &parseResult{}

	actual, captured, err := worker.parseCombatLogWithOptionalCPUProfile(t.Context(), logID, true, func() (*parseResult, error) {
		return expected, nil
	})
	require.NoError(t, err)
	require.True(t, captured)
	require.Same(t, expected, actual)

	profile, err := parent.DownloadParseCPUProfile(t.Context(), logID)
	require.NoError(t, err)
	require.NotEmpty(t, profile)
}

func TestParseCombatLogWithCPUProfilePreservesParseError(t *testing.T) {
	st, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)

	parent := &Chronicle{Storage: st}
	worker := &WorkerLogParse{parent: parent}
	logID := uuid.New()
	parseErr := assert.AnError

	actual, captured, err := worker.parseCombatLogWithOptionalCPUProfile(t.Context(), logID, true, func() (*parseResult, error) {
		return nil, parseErr
	})
	require.ErrorIs(t, err, parseErr)
	require.True(t, captured)
	require.Nil(t, actual)

	profile, err := parent.DownloadParseCPUProfile(t.Context(), logID)
	require.NoError(t, err)
	require.NotEmpty(t, profile)
}

func TestParseCombatLogWithoutCPUProfile(t *testing.T) {
	t.Parallel()

	parent := &Chronicle{}
	worker := &WorkerLogParse{parent: parent}
	expected := &parseResult{}

	actual, captured, err := worker.parseCombatLogWithOptionalCPUProfile(t.Context(), uuid.New(), false, func() (*parseResult, error) {
		return expected, nil
	})
	require.NoError(t, err)
	require.False(t, captured)
	require.Same(t, expected, actual)
}
