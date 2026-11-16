package creatures

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/castv2"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestConcreteCastRetentionProductionRoutes(t *testing.T) {
	t.Parallel()
	for _, route := range []string{"legacy-cc", "core-rager-mark", "object-aura-cast"} {
		t.Run(route, func(t *testing.T) {
			t.Parallel()
			r, newChars := wrapperGraphRegistry(t, nil)
			all := newChars()
			at := time.Unix(100, 0).UTC()
			spell := chrondbc.UnknownSpell(20553)
			require.NoError(t, ownergraph.Register(r, ownergraph.Codec[chrondbc.Spell]{Type: "test.mark.spell", Version: 1, Init: func() *chrondbc.Spell { return new(chrondbc.Spell) }, Capture: func(s *chrondbc.Spell, _ *ownergraph.Capture) ([]byte, error) { return json.Marshal(s.ID) }, Restore: func(s *chrondbc.Spell, _ uint32, b []byte, _ *ownergraph.Restore) error {
				var id chrondbc.SpellID
				if err := json.Unmarshal(b, &id); err != nil {
					return err
				}
				*s = chrondbc.UnknownSpell(id)
				return nil
			}}))
			var event messages.Message
			var id guid.GUID
			switch route {
			case "legacy-cc":
				id = guid.GUID(0xF130000001000001)
				//nolint:staticcheck // Real legacy ProcessCommonActivity CC path.
				event = &messages.Cast{MessageBase: messages.Base(at), CastV2: castv2.CastV2{Caster: types.Unit{Gid: 1}, Target: &types.Unit{Gid: id}, Action: types.CastActionsCasts, Spell: types.Spell{Name: "Polymorph", ID: 118}}}
			case "core-rager-mark":
				id = guid.GUID(0xF130000000000001 | uint64(11672)<<24)
				event = &messages.AuraCast{MessageBase: messages.Base(at), Spell: &spell, Caster: id}
			case "object-aura-cast":
				id = guid.GUID(0xF110000000000001 | uint64(181102)<<24)
				event = &messages.AuraCast{MessageBase: messages.Base(at), Caster: id}
			}
			_, err := all.Process(event)
			require.NoError(t, err)
			ch, ok := all.Get(id)
			require.True(t, ok)
			require.True(t, ch.IsActive())
			periods := ch.Periods()
			require.NotEmpty(t, periods)
			require.Same(t, event, periods[0].Start.Timestamp)
			if route == "core-rager-mark" {
				_, marked := event.MarkHas(messages.MarkTypeStart, id)
				require.True(t, marked, "actual producer must add the mark")
			}
			graph, err := r.Capture(all)
			require.NoError(t, err)
			wire, err := json.Marshal(graph)
			require.NoError(t, err)
			var disk ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &disk))
			root, err := r.Restore(disk)
			require.NoError(t, err)
			fresh := root.(*characters.Characters)
			require.NoError(t, fresh.WireGraphRuntime())
			for _, chars := range []*characters.Characters{all, fresh} {
				_, err = chars.Process(messages.TimedOut(at.Add(10 * time.Minute)))
				require.NoError(t, err)
			}
			want, err := r.Capture(all)
			require.NoError(t, err)
			got, err := r.Capture(fresh)
			require.NoError(t, err)
			require.Equal(t, want, got)
		})
	}
}
