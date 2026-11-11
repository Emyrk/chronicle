package synthetic

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/stretchr/testify/require"
)

type shieldFetcher map[chrondbc.SpellID]*chrondbc.Spell

func (f shieldFetcher) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if s := f[id]; s != nil {
		return s, nil
	}
	return nil, chrondbc.SpellNotFound(id)
}
func shieldFixtures() ([]messages.Message, shieldFetcher) {
	ts := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	all := makeAbsorbSpell("all", 20, 127)
	all.ID = 1
	fire := makeAbsorbSpell("fire", 30, int32(types.FireSchool))
	fire.ID = 2
	unknown := chrondbc.UnknownSpell(99)
	damage := func(ms int, amount uint32) *messages.Damage {
		return &messages.Damage{MessageBase: messages.Base(ts.Add(time.Duration(ms) * time.Millisecond)), Target: 2, Amount: 10, School: types.FireSchool, Trailer: trailAbsorbed(amount)}
	}
	return []messages.Message{
		auraCastAbsorbWithDuration(ts, all, 1, 2, 127, 500),
		auraCastAbsorbWithDuration(ts, fire, 3, 2, int32(types.FireSchool), 1000),
		damage(1, 20), damage(2, 100),
		&messages.Aura{MessageBase: messages.Base(ts.Add(3 * time.Millisecond)), Target: 2, SpellName: "fire", IsBuff: true, State: types.AuraStateRemoved},
		damage(3, 1), damage(4, 1), damage(5, 1),
		auraCastAbsorbWithDuration(ts.Add(10*time.Millisecond), fire, 3, 2, int32(types.FireSchool), 1000),
		&messages.Aura{MessageBase: messages.Base(ts.Add(11 * time.Millisecond)), Target: 2, SpellName: "fire", IsBuff: true, State: types.AuraStateRemoved},
		damage(12, 1),
		auraCastAbsorbWithDuration(ts.Add(20*time.Millisecond), fire, 3, 2, int32(types.FireSchool), 1000),
		&messages.Aura{MessageBase: messages.Base(ts.Add(21 * time.Millisecond)), Target: 2, SpellName: "fire", IsBuff: true, State: types.AuraStateRemoved},
		damage(23, 1), damage(501, 1),
		auraCastAbsorbWithDuration(ts.Add(time.Second), &unknown, 1, 2, 127, 1000), damage(1001, 5), damage(2001, 5),
		auraCastAbsorbWithDuration(ts.Add(3*time.Second), nil, 1, 2, 127, 1000), damage(3001, 5),
	}, shieldFetcher{1: all, 2: fire}
}
func TestAbsorptionStateSplitDerivableSpells(t *testing.T) {
	t.Parallel()
	records, _ := shieldFixtures()
	for split := 0; split <= len(records); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			original, fetcher := shieldFixtures()
			suffix, _ := shieldFixtures()
			continuous := NewAbsorption(nil)
			continuous.ProcessMessages(original[:split])
			refs := map[string]*chrondbc.Spell{}
			capture := func(spell *chrondbc.Spell) (string, error) {
				refs[fmt.Sprint(spell.ID)] = spell
				return fmt.Sprintf("/root/spells/%d", spell.ID), nil
			}
			state, err := continuous.CaptureState(capture)
			require.NoError(t, err)
			payload, err := state.Encode()
			require.NoError(t, err)
			graph, values, err := next.CaptureSpellReferences(refs)
			require.NoError(t, err)
			registration, err := next.NewSpellDerivation(fetcher)
			require.NoError(t, err)
			spells, err := registration.Restore(t.Context(), graph, values)
			require.NoError(t, err)
			decoded, err := DecodeAbsorptionState(1, payload)
			require.NoError(t, err)
			restored, err := decoded.Restore(nil, func(p string) (*chrondbc.Spell, error) {
				s, ok := spells[stategraph.Path(p)]
				if !ok {
					return nil, fmt.Errorf("missing %s", p)
				}
				return s, nil
			})
			require.NoError(t, err)
			want := continuous.ProcessMessages(original[split:])
			got := restored.ProcessMessages(suffix[split:])
			require.Equal(t, want, got)
			require.Equal(t, continuous.activeShields, restored.activeShields)
			after, err := state.Encode()
			require.NoError(t, err)
			require.Equal(t, payload, after)
			after, err = decoded.Encode()
			require.NoError(t, err)
			require.Equal(t, payload, after)
		})
	}
}
func TestAbsorptionStateRejectsInvalid(t *testing.T) {
	t.Parallel()
	records, _ := shieldFixtures()
	a := NewAbsorption(nil)
	a.ProcessMessages(records[:2])
	s, err := a.CaptureState(func(*chrondbc.Spell) (string, error) { return "/root/spells/1", nil })
	require.NoError(t, err)
	b, err := s.Encode()
	require.NoError(t, err)
	_, err = DecodeAbsorptionState(2, b)
	require.Error(t, err)
	for _, payload := range []string{"null", "{}", "{", string(b) + " {}", `{"shields":{"0x0000000000000002":[null]}}`} {
		_, err := DecodeAbsorptionState(1, []byte(payload))
		require.Error(t, err)
	}
	var root map[string]any
	require.NoError(t, json.Unmarshal(b, &root))
	targets := root["shields"].(map[string]any)
	for _, v := range targets {
		v.([]any)[0].(map[string]any)["removed_at"] = "bad"
	}
	bad, err := json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeAbsorptionState(1, bad)
	require.Error(t, err)
	restored, err := s.Restore(nil, func(string) (*chrondbc.Spell, error) { return nil, nil })
	require.Error(t, err)
	require.Nil(t, restored)
	_, err = a.CaptureState(nil)
	require.Error(t, err)
}

func TestAbsorptionStateRetainsOrderCapacityAndGrace(t *testing.T) {
	t.Parallel()
	records, _ := shieldFixtures()
	a := NewAbsorption(nil)
	a.ProcessMessages(records[:5])
	state, err := a.CaptureState(func(s *chrondbc.Spell) (string, error) { return fmt.Sprintf("/root/spells/%d", s.ID), nil })
	require.NoError(t, err)
	entries := state.shields[guid.GUID(2)]
	require.Len(t, entries, 2)
	require.Equal(t, "all", entries[0].SpellName)
	require.Equal(t, "fire", entries[1].SpellName)
	require.True(t, entries[1].Exhausted)
	require.LessOrEqual(t, entries[1].Remaining, int32(0))
	require.False(t, entries[1].RemovedAt.IsZero())
	// Capture does not run expiry or collapse retained removed shields.
	require.Equal(t, a.activeShields[2][1].estRemaining, entries[1].Remaining)
	require.Equal(t, a.activeShields[2][1].durationMS, entries[1].DurationMS)
}
