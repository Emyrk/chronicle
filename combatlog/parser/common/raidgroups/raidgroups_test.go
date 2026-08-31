package raidgroups

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestTrackerLatestAt(t *testing.T) {
	t.Parallel()
	tracker := New()
	start := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	tracker.Process(&messages.RaidGroup{MessageBase: messages.Base(start), Groups: [8][5]guid.GUID{{1}}})
	tracker.Process(&messages.RaidGroup{MessageBase: messages.Base(start.Add(time.Minute)), Groups: [8][5]guid.GUID{{2}}})

	_, ok := tracker.LatestAt(start.Add(-time.Second))
	assert.False(t, ok)
	first, ok := tracker.LatestAt(start.Add(30 * time.Second))
	require.True(t, ok)
	assert.Equal(t, guid.GUID(1), first.Composition[0][0])
	_, ok = tracker.LatestBetween(start.Add(time.Second), start.Add(30*time.Second))
	assert.False(t, ok)
	latest, ok := tracker.LatestBetween(start, start.Add(2*time.Minute))
	require.True(t, ok)
	assert.Equal(t, guid.GUID(2), latest.Composition[0][0])
}

func TestCompositionDatabaseRoundTrip(t *testing.T) {
	t.Parallel()
	composition := Composition{{1, 2}}
	value, err := composition.Value()
	require.NoError(t, err)
	var decoded Composition
	require.NoError(t, decoded.Scan(value))
	assert.Equal(t, composition, decoded)
}
