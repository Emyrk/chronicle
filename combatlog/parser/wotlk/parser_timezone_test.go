package wotlk

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"testing/iotest"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/stretchr/testify/require"
)

func TestNormalizeTimestampUsesHeaderYearAndOffset(t *testing.T) {
	t.Parallel()

	p := &Parser{baseYear: 2026}
	clock := realmclock.FromUnixOffset(1716508800, -420)
	p.SetRealmClockInfo(&clock)

	local := time.Date(0, 5, 23, 18, 30, 0, 0, time.UTC)
	require.Equal(t, time.Date(2024, 5, 24, 1, 30, 0, 0, time.UTC), p.normalizeTimestamp(local))
}

func TestAdvanceReturnsScannerError(t *testing.T) {
	t.Parallel()

	sentinel := errors.New("reader failed")
	p, err := New(
		context.Background(),
		slog.Default(),
		iotest.ErrReader(sentinel),
		auraTestDB{},
		nil,
		registry.NewRegistry(slog.Default(), nil),
	)
	require.NoError(t, err)

	_, err = p.Advance(context.Background())
	require.ErrorIs(t, err, sentinel)
}
