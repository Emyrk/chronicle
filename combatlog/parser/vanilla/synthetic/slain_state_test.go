package synthetic

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/stretchr/testify/require"
)

type retainedSpellFetcher struct{}

func (retainedSpellFetcher) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return nil, chrondbc.SpellNotFound(id)
}

func slainRecords() []messages.Message {
	ts := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	caster := guid.GUID(1)
	z := func(name string, synthetic bool, difficulty int) *messages.Zone {
		return &messages.Zone{MessageBase: messages.Base(ts, func(b *messages.MessageBase) { b.Synthetic = synthetic }), Zone: zone.Zone{Seen: ts, Name: name, MapID: 1, InstanceID: 4, InstanceType: "raid", IsInstance: true, DifficultyIndex: difficulty, DifficultyName: fmt.Sprint(difficulty), MaxPlayers: 40, DynamicDifficulty: 1, SubZone: "sub"}}
	}
	damage := func() *messages.Damage {
		unknown := chrondbc.UnknownSpell(99)
		return &messages.Damage{MessageBase: messages.Base(ts), Caster: &caster, Target: 2, Amount: 100, SpellData: &unknown}
	}
	death := func() *messages.Slain { return &messages.Slain{MessageBase: messages.Base(ts), Victim: 2} }
	return []messages.Message{z("Raid", false, 1), damage(), z("Raid", true, 0), death(), z("Raid", false, 2), death(), damage(), z("Other", true, 0), death(), z("Other", false, 1), damage(), death()}
}
func TestSlainStateSplitSharedGraph(t *testing.T) {
	t.Parallel()
	for split := 0; split <= len(slainRecords()); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			continuous := NewSlainDetective()
			original, suffix := slainRecords(), slainRecords()
			continuous.ProcessMessages(original[:split])
			refs := map[stategraph.Path]*messages.Damage{}
			capture := func(target guid.GUID, d *messages.Damage) (string, error) {
				p := "/root/slain/" + target.String()
				refs[stategraph.Path(p)] = d
				return p, nil
			}
			state, err := continuous.CaptureState(capture)
			require.NoError(t, err)
			payload, err := state.Encode()
			require.NoError(t, err)
			graph, err := next.CaptureDamageGraph(nil, refs)
			require.NoError(t, err)
			restoredDamage, err := graph.Restore(t.Context(), retainedSpellFetcher{})
			require.NoError(t, err)
			decoded, err := DecodeSlainState(1, payload)
			require.NoError(t, err)
			restored, err := decoded.Restore(func(p string) (*messages.Damage, error) {
				d, ok := restoredDamage[stategraph.Path(p)]
				if !ok {
					return nil, fmt.Errorf("missing %s", p)
				}
				return d, nil
			})
			require.NoError(t, err)
			continuous.ProcessMessages(original[split:])
			restored.ProcessMessages(suffix[split:])
			require.Equal(t, original[split:], suffix[split:])
			samePath := func(target guid.GUID, _ *messages.Damage) (string, error) {
				return "/root/slain/" + target.String(), nil
			}
			want, err := continuous.CaptureState(samePath)
			require.NoError(t, err)
			got, err := restored.CaptureState(samePath)
			require.NoError(t, err)
			wantBytes, err := want.Encode()
			require.NoError(t, err)
			gotBytes, err := got.Encode()
			require.NoError(t, err)
			require.Equal(t, wantBytes, gotBytes)
			require.Equal(t, continuous.lastDamage, restored.lastDamage)
			after, err := decoded.Encode()
			require.NoError(t, err)
			require.Equal(t, payload, after)
		})
	}
}
func TestSlainStateRejectsInvalid(t *testing.T) {
	t.Parallel()
	s, err := NewSlainDetective().CaptureState(nil)
	require.NoError(t, err)
	good, err := s.Encode()
	require.NoError(t, err)
	for _, payload := range [][]byte{[]byte("null"), []byte("{}"), append(append([]byte(nil), good...), []byte(" {}")...)} {
		_, err := DecodeSlainState(1, payload)
		require.Error(t, err)
	}
	_, err = DecodeSlainState(2, good)
	require.Error(t, err)
	var v map[string]any
	require.NoError(t, json.Unmarshal(good, &v))
	v["location"].(map[string]any)["zone"].(map[string]any)["Seen"] = "bad"
	bad, err := json.Marshal(v)
	require.NoError(t, err)
	_, err = DecodeSlainState(1, bad)
	require.Error(t, err)
	owner := NewSlainDetective()
	owner.ProcessMessage(&messages.Damage{Target: 1})
	captured, err := owner.CaptureState(func(guid.GUID, *messages.Damage) (string, error) { return "/root/missing", nil })
	require.NoError(t, err)
	restored, err := captured.Restore(func(string) (*messages.Damage, error) { return nil, nil })
	require.Error(t, err)
	require.Nil(t, restored)
}
