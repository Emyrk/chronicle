package rankings

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

func TestSurvivabilityTracker(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, time.September, 21, 12, 0, 0, 0, time.UTC)
	encounterID := uuid.New()
	player := guid.GUID(1)
	otherPlayer := guid.GUID(2)
	tracker := NewSurvivabilityTracker()

	tracker.FightStarted(encounterID, &messages.Slain{MessageBase: messages.Base(start)})
	require.NoError(t, tracker.ProcessMessage(false, encounterID, &messages.Slain{
		MessageBase: messages.Base(start.Add(10 * time.Second)), Victim: player,
	}))
	require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Slain{
		MessageBase: messages.Base(start.Add(20 * time.Second)), Victim: player,
	}))
	require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Slain{
		MessageBase: messages.Base(start.Add(25 * time.Second)), Victim: otherPlayer,
	}))
	require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Resurrection{
		MessageBase: messages.Base(start.Add(40 * time.Second)), Target: player,
	}))
	require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Slain{
		MessageBase: messages.Base(start.Add(70 * time.Second)), Victim: player,
	}))
	require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Resurrection{
		MessageBase: messages.Base(start.Add(80 * time.Second)), Target: player,
	}))
	tracker.FightFinalized(encounterID, start, start.Add(100*time.Second))

	result := tracker.Result()[encounterID]
	require.NotNil(t, result)
	require.InDelta(t, 100, result.DurationSecs, 0.001)

	stats := result.Players[player]
	require.Equal(t, int32(2), stats.Deaths)
	require.InDelta(t, 70, stats.AliveDurationSecs, 0.001)
	require.InDelta(t, 70, stats.AlivePercentage, 0.001)

	otherStats := result.Players[otherPlayer]
	require.Equal(t, int32(1), otherStats.Deaths)
	require.InDelta(t, 25, otherStats.AliveDurationSecs, 0.001)
	require.InDelta(t, 25, otherStats.AlivePercentage, 0.001)
}

func TestSurvivabilityTrackerResetsPerFight(t *testing.T) {
	t.Parallel()

	tracker := NewSurvivabilityTracker()
	player := guid.GUID(1)
	start := time.Date(2026, time.September, 21, 12, 0, 0, 0, time.UTC)
	firstID := uuid.New()
	secondID := uuid.New()

	tracker.FightStarted(firstID, &messages.Slain{MessageBase: messages.Base(start)})
	require.NoError(t, tracker.ProcessMessage(true, firstID, &messages.Slain{
		MessageBase: messages.Base(start.Add(10 * time.Second)), Victim: player,
	}))
	tracker.FightFinalized(firstID, start, start.Add(20*time.Second))

	secondStart := start.Add(time.Minute)
	tracker.FightStarted(secondID, &messages.Slain{MessageBase: messages.Base(secondStart)})
	tracker.FightFinalized(secondID, secondStart, secondStart.Add(30*time.Second))

	require.Equal(t, int32(1), tracker.Result()[firstID].Players[player].Deaths)
	require.Empty(t, tracker.Result()[secondID].Players)
	require.InDelta(t, 30, tracker.Result()[secondID].DurationSecs, 0.001)
}
