package creatures

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestXT002GraphCanonicalOwnersAndVehicleOrder(t *testing.T) {
	t.Parallel()
	for _, high := range []uint64{0xF130000000000001, 0xF150000000000001} {
		r, newChars := expansionGraphRegistry(t, database.WoWFlavor{database.FlavorWrath})
		all := newChars()
		at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		bossID := guid.GUID(high | uint64(33293)<<24)
		heartID := guid.GUID(high | uint64(33329)<<24)
		boss, _ := all.Add(bossID, at)
		heart, _ := all.Add(heartID, at)
		require.IsType(t, &xt002Character{}, boss)
		boss.(*xt002Character).Start("prefix", messages.TimedOut(at))
		heart.(characters.CharacterBase).Start("prefix", messages.TimedOut(at))
		graph, err := r.Capture(all)
		require.NoError(t, err)
		wire, err := json.Marshal(graph)
		require.NoError(t, err)
		var disk ownergraph.Snapshot
		require.NoError(t, json.Unmarshal(wire, &disk))
		v, err := r.Restore(disk)
		require.NoError(t, err)
		fresh := v.(*characters.Characters)
		require.NoError(t, fresh.WireGraphRuntime())
		restoredOwner, ok := fresh.All.Get(bossID)
		require.True(t, ok)
		restored := restoredOwner.(*xt002Character)
		require.Same(t, fresh, restored.all)
		require.Same(t, fresh, restored.Lookup())
		require.NotSame(t, all, restored.all)
		for _, chars := range []*characters.Characters{all, fresh} {
			_, err = chars.Process(&messages.Slain{MessageBase: messages.Base(at.Add(time.Second)), Victim: bossID})
			require.NoError(t, err)
			linked, ok := chars.All.Get(heartID)
			require.True(t, ok)
			require.False(t, linked.IsActive())
		}
		a, err := r.Capture(all)
		require.NoError(t, err)
		b, err := r.Capture(fresh)
		require.NoError(t, err)
		require.Equal(t, a, b)
	}
}
