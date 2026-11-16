package creatures

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

// Arugal's production Process bumps LastActive on SpellStart. This must pass
// through the real factory/character path, not seed a period with a fake mark.
func TestArugalSpellStartGraphContinuation(t *testing.T) {
	t.Parallel()
	for _, withSpell := range []bool{false, true} {
		t.Run(map[bool]string{false: "missing_spell", true: "resolved_spell"}[withSpell], func(t *testing.T) {
			t.Parallel()
			r, newChars := wrapperGraphRegistry(t, nil)
			sp := chrondbc.UnknownSpell(7588)
			require.NoError(t, ownergraph.Register(r, ownergraph.Codec[chrondbc.Spell]{Type: "test.arugal-spell", Version: 1, Init: func() *chrondbc.Spell { return new(chrondbc.Spell) }, Capture: func(s *chrondbc.Spell, _ *ownergraph.Capture) ([]byte, error) {
				require.Equal(t, sp, *s)
				return json.Marshal(s.ID)
			}, Restore: func(s *chrondbc.Spell, _ uint32, b []byte, _ *ownergraph.Restore) error {
				var id chrondbc.SpellID
				if err := json.Unmarshal(b, &id); err != nil {
					return err
				}
				*s = chrondbc.UnknownSpell(id)
				return nil
			}}))
			all := newChars()
			boss := guid.GUID(0xF130000000000001 | uint64(4275)<<24)
			player := guid.GUID(1)
			at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			hit := &messages.Damage{MessageBase: messages.Base(at), Caster: &player, Target: boss, Amount: 10}
			_, err := all.Process(hit)
			require.NoError(t, err)
			ch, ok := all.Get(boss)
			require.True(t, ok)
			require.IsType(t, &archmageArugal{}, ch)
			require.True(t, ch.IsActive())
			cast := &messages.SpellStart{MessageBase: messages.Base(at.Add(time.Second)), Caster: boss, Target: &player, SpellID: 7588, Flags: 3, CastTime: 2 * time.Second, ChannelDuration: 3 * time.Second, SpellType: 1}
			if withSpell {
				cast.SpellData = &sp
			}
			_, err = all.Process(cast)
			require.NoError(t, err)
			current, ok := ch.(*archmageArugal).CurrentPeriod()
			require.True(t, ok)
			require.Same(t, cast, current.LastActive.Timestamp)
			require.Equal(t, "casting", current.LastActive.Reason)
			graph, err := r.Capture(all)
			require.NoError(t, err)
			wire, err := json.Marshal(graph)
			require.NoError(t, err)
			var disk ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &disk))
			restored, err := r.Restore(disk)
			require.NoError(t, err)
			fresh := restored.(*characters.Characters)
			require.NoError(t, fresh.WireGraphRuntime())
			again, err := r.Capture(fresh)
			require.NoError(t, err)
			require.Equal(t, graph, again)
			got, ok := fresh.Get(boss)
			require.True(t, ok)
			restoredPeriod, ok := got.(*archmageArugal).CurrentPeriod()
			require.True(t, ok)
			require.Equal(t, cast, restoredPeriod.LastActive.Timestamp)
			require.NotSame(t, cast, restoredPeriod.LastActive.Timestamp)
			// Continue the real casting and inactivity paths, then compare full graphs.
			for _, chars := range []*characters.Characters{all, fresh} {
				suffix := &messages.SpellStart{MessageBase: messages.Base(at.Add(5 * time.Second)), Caster: boss, SpellID: 7588}
				_, err = chars.Process(suffix)
				require.NoError(t, err)
				_, err = chars.Process(messages.TimedOut(at.Add(5 * time.Minute)))
				require.NoError(t, err)
			}
			want, err := r.Capture(all)
			require.NoError(t, err)
			actual, err := r.Capture(fresh)
			require.NoError(t, err)
			require.Equal(t, want, actual)
		})
	}
}
