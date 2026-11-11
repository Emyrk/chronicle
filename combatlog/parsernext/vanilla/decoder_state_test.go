package vanilla

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/stretchr/testify/require"
)

const stateHeader = "0|HEADER|0x0000000000000001|Test Realm|Test Zone|0.38.4|1.5|2.0||1.18.0|7234|build date|23.02.26 19:17:05|23.02.26 18:17:05"

func stateBytes(t *testing.T, s DecoderState) []byte {
	t.Helper()
	b, err := s.Encode()
	require.NoError(t, err)
	return b
}

func TestDecoderStateResume(t *testing.T) {
	t.Parallel()
	records := []string{
		stateHeader,
		strings.Replace(stateHeader, "0.38.4", "invalid", 1),
		"10000|COMBATANT_TRANSMOG|Player|1:33440:61053",
		"10000|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3|Guild|Rank|2|Helm;1001853:5:0:6|12}3}4||",
		"10000|COMBATANT_TRANSMOG|Player|1:33440:61053",
		"10001|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3||||Helm;999:0:0:0|12}3}4||",
		"10001|COMBATANT_TRANSMOG|Player|1:100:200&2:300:400",
		"10002|RAID_COMPOSITION|roster|1|1,1,1,0",
		"10002|UNIT_STATE|0x0000000000000001|10|100|2|20|0|1|0.25|0.75|",
		stateHeader,
		strings.Replace(stateHeader, "0.38.4", "invalid", 1),
		"10003|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3||||Helm;999:0:0:0|12}3}4||",
		"9003|COMBAT_END",
	}
	for split := 0; split <= len(records); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			continuous := NewDecoder(nil, "build")
			for _, r := range records[:split] {
				_, err := continuous.DecodeRecord(t.Context(), r)
				require.NoError(t, err)
			}
			captured := continuous.CaptureState()
			payload := stateBytes(t, captured)
			decoded, err := DecodeDecoderState(DecoderStateVersion, payload)
			require.NoError(t, err)
			resumed, err := decoded.Restore(nil, "build")
			require.NoError(t, err)
			require.Equal(t, payload, stateBytes(t, resumed.CaptureState()))
			for _, r := range records[split:] {
				want, werr := continuous.DecodeRecord(t.Context(), r)
				got, gerr := resumed.DecodeRecord(t.Context(), r)
				require.Equal(t, werr, gerr)
				require.Equal(t, want, got)
			}
			require.Equal(t, stateBytes(t, continuous.CaptureState()), stateBytes(t, resumed.CaptureState()))
			require.Equal(t, payload, stateBytes(t, captured))
			require.Equal(t, payload, stateBytes(t, decoded))
		})
	}
}

func TestDecoderStateHeaderAndClock(t *testing.T) {
	t.Parallel()
	for _, first := range []string{stateHeader, strings.Replace(stateHeader, "0.38.4", "invalid", 1), strings.Replace(stateHeader, "0.38.4", "0.18", 1)} {
		d := NewDecoder(nil, "")
		_, err := d.DecodeRecord(t.Context(), first)
		require.NoError(t, err)
		s, err := DecodeDecoderState(DecoderStateVersion, stateBytes(t, d.CaptureState()))
		require.NoError(t, err)
		restored, err := s.Restore(nil, "")
		require.NoError(t, err)
		originalState, restoredState := d.State(), restored.State()
		require.True(t, restoredState.LastTimestamp().IsZero())
		want, ok := originalState.Version()
		got, gok := restoredState.Version()
		require.Equal(t, ok, gok)
		require.Equal(t, want, got)
		for _, r := range []string{"10000|COMBAT_END", strings.Replace(stateHeader, "0.38.4", "invalid", 1), "10000|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3||||Helm;999:0:0:0|12}3}4||", "9000|COMBAT_END", "7999|COMBAT_END"} {
			a, ae := d.DecodeRecord(t.Context(), r)
			b, be := restored.DecodeRecord(t.Context(), r)
			require.Equal(t, ae, be)
			require.Equal(t, a, b)
		}
	}
}

func TestDecoderStateDetached(t *testing.T) {
	t.Parallel()
	d := NewDecoder(nil, "")
	batch, err := d.DecodeRecord(t.Context(), "10000|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3|Guild|Rank|2|Helm;999:5:0:6|12}3}4||")
	require.NoError(t, err)
	// Resolver-populated gear and exact cached talents must survive without invoking
	// any runtime resolver or canonicalizer during restoration.
	c := d.combatants.latestCombatantByName["Player"]
	c.GearSetups[0].BonusIDs = []int{4}
	c.GearSetups[0].Gems = []combatant.GearGem{{ItemID: 5}}
	c.Talents.TabNames[0] = "Exact identity"
	c.Talents.Summary[0] = 99
	d.combatants.latestCombatantByName["Player"] = c
	snapshot := d.CaptureState()
	before := stateBytes(t, snapshot)
	emitted := batch[0].(*messages.Combatant)
	emitted.Guild.Name = "changed"
	emitted.Talents.Trees[0][0] = 8
	*c.GearSetups[0].EnchantID = 90
	c.GearSetups[0].BonusIDs[0] = 90
	c.GearSetups[0].Gems[0].ItemID = 90
	require.Equal(t, before, stateBytes(t, snapshot))
	one, err := snapshot.Restore(nil, "")
	require.NoError(t, err)
	two, err := snapshot.Restore(nil, "")
	require.NoError(t, err)
	require.Equal(t, uint8(99), one.combatants.latestCombatantByName["Player"].Talents.Summary[0])
	one.combatants.latestCombatantByName["Player"].Talents.Trees[0][0] = 9
	one.combatants.latestCombatantByName["Player"].GearSetups[0].BonusIDs[0] = 9
	require.Equal(t, before, stateBytes(t, two.CaptureState()))
	require.Equal(t, before, stateBytes(t, snapshot))
}

func TestDecoderStateRejectsCorruption(t *testing.T) {
	t.Parallel()
	valid := stateBytes(t, NewDecoder(nil, "").CaptureState())
	for _, payload := range []string{"null", "{}", "{", string(valid) + " {}", `{"unknown":1}`, `{"companion_version":"bad"}`, `{"last_timestamp":"bad"}`, `{"combatants":{"Player":{"Name":"Other"}}}`, `{"transmogs":{"Player":{"0":{"ObservedItemID":1,"HasObservedItemID":false}}}}`} {
		_, err := DecodeDecoderState(DecoderStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeDecoderState(version, valid)
		require.Error(t, err)
	}
	var changed map[string]any
	require.NoError(t, json.Unmarshal(valid, &changed))
	changed["capabilities"] = map[string]any{"unknown": true}
	payload, err := json.Marshal(changed)
	require.NoError(t, err)
	_, err = DecodeDecoderState(DecoderStateVersion, payload)
	require.Error(t, err)
	for key, value := range map[string]any{
		"companion_version": "bad",
		"last_timestamp":    nil,
		"capabilities":      nil,
		"combatants":        map[string]any{"Player": map[string]any{"Name": "Other"}},
		"transmogs":         map[string]any{"Player": map[string]any{"0": map[string]any{"ObservedItemID": 1, "HasObservedItemID": false}}},
	} {
		var fields map[string]any
		require.NoError(t, json.Unmarshal(valid, &fields))
		fields[key] = value
		b, err := json.Marshal(fields)
		require.NoError(t, err)
		_, err = DecodeDecoderState(DecoderStateVersion, b)
		require.Error(t, err, key)
	}
	// Even an internally corrupted DTO cannot yield a partially restored decoder.
	s := DecoderState{value: decoderStateValue{Combatants: map[string]combatantValue{"bad": {Name: "other"}}}}
	d, err := s.Restore(nil, "")
	require.Error(t, err)
	require.Nil(t, d)
}

// Restore must inject dependencies, not rerun them against captured values.
type stateGearResolver struct{ calls int }

func (r *stateGearResolver) ResolveGear(gear []combatant.GearItem) {
	r.calls++
	gear[0].Name = "resolved"
}

func TestDecoderStateRuntimeDependencies(t *testing.T) {
	t.Parallel()
	record := "10000|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3||||Helm;999:0:0:0|12}3}4||"
	original := &stateGearResolver{}
	d := NewDecoder(nil, "old build", DecoderOptions{Combatants: CombatantOptions{Gear: original}})
	_, err := d.DecodeRecord(t.Context(), record)
	require.NoError(t, err)
	snapshot := d.CaptureState()
	injected := &stateGearResolver{}
	restored, err := snapshot.Restore(nil, "new build", DecoderOptions{Combatants: CombatantOptions{Gear: injected}})
	require.NoError(t, err)
	require.Equal(t, 0, injected.calls)
	require.Equal(t, "new build", restored.chronicleVersion)
	require.Equal(t, "resolved", restored.combatants.latestCombatantByName["Player"].GearSetups[0].Name)
	_, err = restored.DecodeRecord(t.Context(), record)
	require.NoError(t, err)
	require.Equal(t, 1, injected.calls)
	require.Equal(t, 1, original.calls)
}
