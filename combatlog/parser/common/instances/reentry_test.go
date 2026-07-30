package instances

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

func completedHookable(completedAt, lastActivity time.Time, reentryGap time.Duration) *Hookable {
	rules := rankings.SpeedrunRules{ReentryGap: reentryGap}
	tracker := rankings.NewSpeedrunTracker(rules, nil, nil)
	tracker.FightEnded(uuid.New(), messages.TimedOut(completedAt))
	return &Hookable{
		speedrunTracker: tracker,
		lastActivity:    lastActivity,
	}
}

func TestHookableShouldStartNewRun(t *testing.T) {
	t.Parallel()

	completedAt := time.Date(2026, 7, 19, 18, 53, 23, 0, time.UTC)

	t.Run("raid requires more than twenty four hours", func(t *testing.T) {
		t.Parallel()
		h := completedHookable(completedAt, completedAt, 0)
		assert.False(t, h.ShouldStartNewRun(completedAt.Add(24*time.Hour)))
		assert.True(t, h.ShouldStartNewRun(completedAt.Add(24*time.Hour+time.Millisecond)))
	})

	t.Run("dungeon requires more than fifteen minutes", func(t *testing.T) {
		t.Parallel()
		h := completedHookable(completedAt, completedAt, rankings.DungeonReentryGap)
		assert.False(t, h.ShouldStartNewRun(completedAt.Add(15*time.Minute)))
		assert.True(t, h.ShouldStartNewRun(completedAt.Add(15*time.Minute+time.Millisecond)))
	})

	t.Run("gap starts at last activity after completion", func(t *testing.T) {
		t.Parallel()
		lastActivity := completedAt.Add(time.Hour)
		h := completedHookable(completedAt, lastActivity, rankings.DungeonReentryGap)
		assert.False(t, h.ShouldStartNewRun(lastActivity.Add(15*time.Minute)))
		assert.True(t, h.ShouldStartNewRun(lastActivity.Add(15*time.Minute+time.Millisecond)))
	})

	t.Run("incomplete run never splits", func(t *testing.T) {
		t.Parallel()
		tracker := rankings.NewSpeedrunTracker(rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{{Name: "Boss", EntryIDs: []uint32{1}, Count: 1}},
		}, nil, nil)
		h := &Hookable{speedrunTracker: tracker, lastActivity: completedAt}
		assert.False(t, h.ShouldStartNewRun(completedAt.Add(7*24*time.Hour)))
	})
}
