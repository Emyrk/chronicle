package synthetic

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func auraStateBytes(t *testing.T, s AuraOwnershipState) []byte {
	t.Helper()
	b, err := s.Encode()
	require.NoError(t, err)
	return b
}

func auraStateRecords() []messages.Message {
	ts := time.Date(2026, time.February, 23, 18, 17, 5, 0, time.UTC)
	target := guid.GUID(2)
	spell := &chrondbc.Spell{ID: 6077}
	cast := func(ms int, caster guid.GUID) *messages.AuraCast {
		return &messages.AuraCast{MessageBase: messages.Base(ts.Add(time.Duration(ms) * time.Millisecond)), Caster: caster, Target: &target, Spell: spell}
	}
	aura := func(ms int) *messages.Aura {
		return &messages.Aura{MessageBase: messages.Base(ts.Add(time.Duration(ms) * time.Millisecond)), Target: target, SpellData: spell, State: types.AuraStateAdded}
	}
	authoritative := aura(104)
	source := guid.GUID(9)
	authoritative.Source = &source
	return []messages.Message{
		cast(0, 1), aura(-1), aura(3), aura(100), aura(101),
		cast(102, 1), cast(103, 3), authoritative, aura(104), aura(105),
		&messages.AuraCast{MessageBase: messages.Base(ts.Add(106 * time.Millisecond)), Caster: 0, Target: &target, Spell: spell},
		aura(106), aura(204),
	}
}

func TestAuraOwnershipStateResume(t *testing.T) {
	t.Parallel()
	for split := 0; split <= len(auraStateRecords()); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			continuous := NewAuraOwnership()
			original := auraStateRecords()
			resumedMessages := auraStateRecords()
			continuous.ProcessMessages(original[:split])
			capture := continuous.CaptureState()
			payload := auraStateBytes(t, capture)
			state, err := DecodeAuraOwnershipState(AuraOwnershipStateVersion, payload)
			require.NoError(t, err)
			restored, err := state.Restore()
			require.NoError(t, err)
			continuous.ProcessMessages(original[split:])
			restored.ProcessMessages(resumedMessages[split:])
			require.Equal(t, original[split:], resumedMessages[split:])
			require.Equal(t, auraStateBytes(t, continuous.CaptureState()), auraStateBytes(t, restored.CaptureState()))
			require.Equal(t, payload, auraStateBytes(t, capture))
			require.Equal(t, payload, auraStateBytes(t, state))
		})
	}
}

func TestAuraOwnershipStateValueOnlyAndEdgeCases(t *testing.T) {
	t.Parallel()
	a := NewAuraOwnership()
	target := guid.GUID(0)
	spell := &chrondbc.Spell{ID: 0}
	cast := &messages.AuraCast{MessageBase: messages.Base(time.Time{}), Caster: 1, Target: &target, Spell: spell}
	a.ProcessMessages([]messages.Message{cast})
	require.Len(t, a.pending, 1) // Zero target, spell and timestamp really are accepted.
	captured := a.CaptureState()
	before := auraStateBytes(t, captured)
	target = 9
	spell.ID = 99
	cast.Caster = 8
	cast.Timestamp = time.UnixMilli(123456789)
	require.Equal(t, before, auraStateBytes(t, a.CaptureState()))
	// Even a centuries-old candidate remains captured until processing expires it.
	decoded, err := DecodeAuraOwnershipState(AuraOwnershipStateVersion, before)
	require.NoError(t, err)
	first, err := decoded.Restore()
	require.NoError(t, err)
	second, err := decoded.Restore()
	require.NoError(t, err)
	aura := &messages.Aura{MessageBase: messages.Base(time.Time{}), Target: 0, SpellData: &chrondbc.Spell{ID: 0}, State: types.AuraStateAdded}
	first.ProcessMessages([]messages.Message{aura})
	require.NotNil(t, aura.Source)
	require.Equal(t, guid.GUID(1), *aura.Source)
	*aura.Source = 7 // The emitted source pointer does not point into retained state.
	require.Equal(t, before, auraStateBytes(t, first.CaptureState()))
	first.ProcessMessages([]messages.Message{&messages.Aura{MessageBase: messages.Base(time.UnixMilli(1000))}})
	require.Empty(t, first.pending)
	require.Len(t, second.pending, 1)
	require.Equal(t, before, auraStateBytes(t, captured))
	require.Equal(t, before, auraStateBytes(t, decoded))
	// Invalid input pointers/zero caster do not add candidates.
	a = NewAuraOwnership()
	a.ProcessMessages([]messages.Message{
		&messages.AuraCast{Caster: 1, Target: &target},
		&messages.AuraCast{Caster: 1, Spell: spell},
		&messages.AuraCast{Target: &target, Spell: spell},
	})
	require.Empty(t, a.pending)
}

func TestAuraOwnershipStateRejectsCorruption(t *testing.T) {
	t.Parallel()
	valid := `{"target":"0x0000000000000000","spell_id":0,"caster":"0x0000000000000001","at":"2026-02-23T18:17:05Z"}`
	good := []byte(`{"pending":[` + valid + `]}`)
	_, err := DecodeAuraOwnershipState(1, good)
	require.NoError(t, err)
	for _, payload := range []string{"null", "{}", "{", string(good) + " {}", `{"pending":[],"unknown":true}`, `{"pending":[null]}`, `{"pending":[` + valid + `,` + valid + `]}`} {
		_, err := DecodeAuraOwnershipState(1, []byte(payload))
		require.Error(t, err, payload)
	}
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeAuraOwnershipState(version, good)
		require.Error(t, err)
	}
	for field, value := range map[string]any{"target": nil, "spell_id": nil, "caster": "0x0000000000000000", "at": "broken", "unknown": true} {
		var entry map[string]any
		require.NoError(t, json.Unmarshal([]byte(valid), &entry))
		entry[field] = value
		payload, err := json.Marshal(map[string]any{"pending": []any{entry}})
		require.NoError(t, err)
		_, err = DecodeAuraOwnershipState(1, payload)
		require.Error(t, err, field)
	}
	for _, field := range []string{"target", "spell_id", "caster", "at"} {
		var entry map[string]any
		require.NoError(t, json.Unmarshal([]byte(valid), &entry))
		delete(entry, field)
		payload, err := json.Marshal(map[string]any{"pending": []any{entry}})
		require.NoError(t, err)
		_, err = DecodeAuraOwnershipState(1, payload)
		require.Error(t, err, field)
	}
	// Validation precedes creation of any usable runtime instance.
	restored, err := (AuraOwnershipState{pending: []auraCastValue{{Caster: 0}}}).Restore()
	require.Error(t, err)
	require.Nil(t, restored)
}
