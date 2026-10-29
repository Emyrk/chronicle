package instances

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
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

type slainReentryCharacter struct {
	id guid.GUID
}

func (c *slainReentryCharacter) ID() guid.GUID                       { return c.id }
func (c *slainReentryCharacter) IsActive() bool                      { return false }
func (c *slainReentryCharacter) String() string                      { return c.id.String() }
func (c *slainReentryCharacter) Died(string, messages.Message)       {}
func (c *slainReentryCharacter) Process(messages.Message) error      { return nil }
func (c *slainReentryCharacter) Periods() []period.Period            { return nil }
func (c *slainReentryCharacter) RecentlySlain(messages.Message) bool { return false }
func (c *slainReentryCharacter) LastEndState() period.EndState       { return period.EndStateSlain }
func (c *slainReentryCharacter) SetPeriodHook(period.Hook)           {}
func (c *slainReentryCharacter) CurrentPeriod() (period.Period, bool) {
	return period.Period{EndState: period.EndStateSlain}, true
}

func bossesCompletedHookable(completedAt, lastActivity time.Time, reentryGap time.Duration) *Hookable {
	const bossEntry uint32 = 1
	rules := rankings.SpeedrunRules{
		Requirements: []rankings.SpeedrunRequirement{
			{Name: "Boss", EntryIDs: []uint32{bossEntry}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			{Name: "Trailing Trash", EntryIDs: []uint32{2}, Count: 1, Category: rankings.SpeedrunCategoryTrash},
		},
		ReentryGap: reentryGap,
	}
	tracker := rankings.NewSpeedrunTracker(rules, nil, nil)
	tracker.FightStarted(uuid.New(), messages.TimedOut(completedAt.Add(-time.Minute)))
	tracker.ActivityChange(messages.TimedOut(completedAt), &slainReentryCharacter{
		id: guid.GUID(0xF130000000000000 | uint64(bossEntry)<<24 | 1),
	})
	tracker.FightEnded(uuid.New(), messages.TimedOut(completedAt))
	return &Hookable{speedrunTracker: tracker, lastActivity: lastActivity}
}

func TestHookableShouldStartNewRun(t *testing.T) {
	t.Parallel()

	completedAt := time.Date(2026, 7, 19, 18, 53, 23, 0, time.UTC)

	t.Run("raid splits after six hours", func(t *testing.T) {
		t.Parallel()
		h := completedHookable(completedAt, completedAt, 0)
		assert.False(t, h.ShouldStartNewRun(completedAt.Add(6*time.Hour-time.Millisecond)))
		assert.True(t, h.ShouldStartNewRun(completedAt.Add(6*time.Hour)))
	})

	t.Run("all raid bosses killed allows reentry after one hour", func(t *testing.T) {
		t.Parallel()
		h := bossesCompletedHookable(completedAt, completedAt, 0)
		assert.False(t, h.ShouldStartNewRun(completedAt.Add(time.Hour-time.Millisecond)))
		assert.True(t, h.ShouldStartNewRun(completedAt.Add(time.Hour)))
	})

	t.Run("configured shorter gap still applies after all bosses", func(t *testing.T) {
		t.Parallel()
		h := bossesCompletedHookable(completedAt, completedAt, rankings.DungeonReentryGap)
		assert.False(t, h.ShouldStartNewRun(completedAt.Add(rankings.DungeonReentryGap-time.Millisecond)))
		assert.True(t, h.ShouldStartNewRun(completedAt.Add(rankings.DungeonReentryGap)))
	})

	t.Run("dungeon splits after fifteen minutes", func(t *testing.T) {
		t.Parallel()
		h := completedHookable(completedAt, completedAt, rankings.DungeonReentryGap)
		assert.False(t, h.ShouldStartNewRun(completedAt.Add(15*time.Minute-time.Millisecond)))
		assert.True(t, h.ShouldStartNewRun(completedAt.Add(15*time.Minute)))
	})

	t.Run("gap starts at last activity after completion", func(t *testing.T) {
		t.Parallel()
		lastActivity := completedAt.Add(time.Hour)
		h := completedHookable(completedAt, lastActivity, rankings.DungeonReentryGap)
		assert.False(t, h.ShouldStartNewRun(lastActivity.Add(15*time.Minute-time.Millisecond)))
		assert.True(t, h.ShouldStartNewRun(lastActivity.Add(15*time.Minute)))
	})

	t.Run("incomplete raid splits after six hours", func(t *testing.T) {
		t.Parallel()
		tracker := rankings.NewSpeedrunTracker(rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{{Name: "Boss", EntryIDs: []uint32{1}, Count: 1}},
		}, nil, nil)
		h := &Hookable{speedrunTracker: tracker, lastActivity: completedAt}
		assert.False(t, h.ShouldStartNewRun(completedAt.Add(6*time.Hour-time.Millisecond)))
		assert.True(t, h.ShouldStartNewRun(completedAt.Add(6*time.Hour)))
	})

	t.Run("instance without speedrun rules never splits", func(t *testing.T) {
		t.Parallel()
		h := &Hookable{lastActivity: completedAt}
		assert.False(t, h.ShouldStartNewRun(completedAt.Add(7*24*time.Hour)))
	})
}
