package creatures

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestRazorgoreGraphTimeoutResetAndLastSlain(t *testing.T) {
	t.Parallel()
	for _, death := range []bool{false, true} {
		r, newChars := wrapperGraphRegistry(t, database.ServerFlavor("turtle", database.FlavorVanilla))
		all := newChars()
		at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		id := guid.GUID(0xF130000000000001 | uint64(12435)<<24)
		player := guid.GUID(1)
		c, _ := all.Add(id, at)
		boss := c.(*characters.AdsGoWithBoss).CharacterBase.(*razorgore)
		hit := func(at time.Time) *messages.Damage {
			return &messages.Damage{MessageBase: messages.Base(at), Caster: &player, Target: id, Amount: 1}
		}
		require.NoError(t, boss.Process(hit(at)))
		for i := 1; i <= 3; i++ {
			require.NoError(t, boss.Process(&messages.SpellGo{MessageBase: messages.Base(at.Add(time.Duration(i) * time.Second)), Caster: id, SpellData: &chrondbc.Spell{ID: 19873}}))
		}
		require.Equal(t, 3, boss.eggCount)
		require.NoError(t, boss.Process(hit(at.Add(4*time.Second))))
		if death {
			require.NoError(t, boss.Process(&messages.Slain{MessageBase: messages.Base(at.Add(5 * time.Second)), Victim: id}))
			require.Equal(t, period.EndStateReset, boss.Activity.History[0].Get().EndState)
			require.NotNil(t, boss.LastSlain)
		}
		graph, err := r.Capture(all)
		require.NoError(t, err)
		b, err := json.Marshal(graph)
		require.NoError(t, err)
		var disk ownergraph.Snapshot
		require.NoError(t, json.Unmarshal(b, &disk))
		v, err := r.Restore(disk)
		require.NoError(t, err)
		fresh := v.(*characters.Characters)
		require.NoError(t, fresh.WireGraphRuntime())
		restored := fresh.ByEntry[12435][0].(*characters.AdsGoWithBoss).CharacterBase.(*razorgore)
		require.Equal(t, boss.eggCount, restored.eggCount)
		require.Equal(t, boss.adsGone, restored.adsGone)
		if death {
			require.Same(t, restored.LastSlain, restored.Activity.History[0].Get().End.Timestamp)
		}
		for _, c := range []*razorgore{boss, restored} {
			if death {
				require.NoError(t, c.Process(hit(at.Add(6*time.Second))))
				require.False(t, c.IsActive(), "lingering damage stays suppressed")
			}
			require.NoError(t, c.Process(hit(at.Add(2*time.Minute))))
			require.Zero(t, c.eggCount)
			require.False(t, c.adsGone)
			require.NoError(t, c.Process(&messages.SpellGo{MessageBase: messages.Base(at.Add(2*time.Minute + time.Second)), Caster: id, SpellData: &chrondbc.Spell{ID: 19873}}))
			require.Equal(t, 1, c.eggCount, "new pull cannot inherit old eggs")
			require.NoError(t, c.Process(hit(at.Add(2*time.Minute+2*time.Second))))
		}
		a, err := r.Capture(all)
		require.NoError(t, err)
		bgraph, err := r.Capture(fresh)
		require.NoError(t, err)
		require.Equal(t, a, bgraph)
	}
}
