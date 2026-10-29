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

func TestSurvivabilityTrackerRankingWindow(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, time.September, 21, 12, 0, 0, 0, time.UTC)
	encounterID := uuid.New()
	before := guid.GUID(1)
	during := guid.GUID(2)
	stillDead := guid.GUID(3)
	tracker := NewSurvivabilityTracker()
	tracker.FightStarted(encounterID, &messages.Slain{MessageBase: messages.Base(start)})
	for _, event := range []struct {
		at     int
		player guid.GUID
		dead   bool
	}{
		{20, before, true}, {20, stillDead, true},
		{40, before, false}, {45, during, true}, {55, during, false},
		{65, stillDead, false}, {70, before, true}, {80, during, true},
	} {
		at := start.Add(time.Duration(event.at) * time.Second)
		if event.dead {
			require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Slain{
				MessageBase: messages.Base(at), Victim: event.player,
			}))
		} else {
			require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Resurrection{
				MessageBase: messages.Base(at), Target: event.player,
			}))
		}
	}
	tracker.FightFinalized(encounterID, start, start.Add(100*time.Second))
	require.Equal(t, int32(2), tracker.Result()[encounterID].Players[before].Deaths)

	// The boss ranking window starts after the first two deaths and ends before
	// later deaths. Dead players remain dead when the window starts.
	tracker.FightFinalized(encounterID, start.Add(30*time.Second), start.Add(60*time.Second))
	result := tracker.Result()[encounterID]
	require.Equal(t, float64(30), result.DurationSecs)
	require.Equal(t, int32(0), result.Players[before].Deaths)
	require.InDelta(t, 20, result.Players[before].AliveDurationSecs, 0.001)
	require.InDelta(t, 200.0/3, result.Players[before].AlivePercentage, 0.001)
	require.Equal(t, int32(1), result.Players[during].Deaths)
	require.InDelta(t, 20, result.Players[during].AliveDurationSecs, 0.001)
	require.Equal(t, int32(0), result.Players[stillDead].Deaths)
	require.Zero(t, result.Players[stillDead].AlivePercentage)
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
