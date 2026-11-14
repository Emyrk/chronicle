package messages

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestDamageStateAllFieldsDetached(t *testing.T) {
	t.Parallel()
	caster := guid.GUID(1)
	name := "spell"
	amount := uint32(5)
	env := types.EnvironmentType("test")
	d := &Damage{MessageBase: Base(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), WithSynthetic()), SpellName: &name, SpellID: 8, SpellData: &chrondbc.Spell{ID: 9}, Caster: &caster, Target: 2, HitType: 3, Amount: 40, Unranked: 20, Overkill: 5, School: 2, Trailer: types.Trailer{{Amount: &amount, HitType: 4}, {Amount: nil, HitType: 8}}, EnvironmentType: &env}
	d.AddActivity(1, ActivityStart)
	d.MarkActivityIgnore("reason", 1)
	state, err := d.CaptureState("/root/spells/9")
	require.NoError(t, err)
	payload, err := state.Encode()
	require.NoError(t, err)
	decoded, err := DecodeDamageState(1, payload)
	require.NoError(t, err)
	restored, err := decoded.Restore(func(string) (*chrondbc.Spell, error) { return d.SpellData, nil })
	require.NoError(t, err)
	require.Equal(t, d, restored)
	d.activity[1] = ActivityEnd
	(*d.marks)[MarkTypeIgnoreActivity].Targets[1] = "changed"
	*d.Trailer[0].Amount = 99
	*d.Caster = 8
	again, err := state.Encode()
	require.NoError(t, err)
	require.Equal(t, payload, again)
	restored.activity[1] = ActivityEnd
	(*restored.marks)[MarkTypeIgnoreActivity].Targets[1] = "changed"
	*restored.Trailer[0].Amount = 3
	again, err = decoded.Encode()
	require.NoError(t, err)
	require.Equal(t, payload, again)
}

func TestMessageBaseNilAndEmptyState(t *testing.T) {
	t.Parallel()
	nilMarks := marks(nil)
	emptyMarks := marks{}
	for _, b := range []MessageBase{{}, {marks: &nilMarks}, {marks: &emptyMarks, activity: map[guid.GUID]ActivityEventType{}}} {
		d := &Damage{MessageBase: b}
		state, err := d.CaptureState("")
		require.NoError(t, err)
		payload, err := state.Encode()
		require.NoError(t, err)
		decoded, err := DecodeDamageState(1, payload)
		require.NoError(t, err)
		restored, err := decoded.Restore(nil)
		require.NoError(t, err)
		require.Equal(t, d, restored)
	}
	for _, trailer := range []types.Trailer{nil, {}} {
		d := &Damage{Trailer: trailer}
		state, err := d.CaptureState("")
		require.NoError(t, err)
		b, err := state.Encode()
		require.NoError(t, err)
		decoded, err := DecodeDamageState(1, b)
		require.NoError(t, err)
		restored, err := decoded.Restore(nil)
		require.NoError(t, err)
		require.Equal(t, d, restored)
	}
}

func TestDamageStateRejectsMalformed(t *testing.T) {
	t.Parallel()
	state, err := (&Damage{}).CaptureState("")
	require.NoError(t, err)
	b, err := state.Encode()
	require.NoError(t, err)
	for _, payload := range [][]byte{[]byte("null"), []byte("{}"), append(append([]byte(nil), b...), []byte(" {}")...)} {
		_, err := DecodeDamageState(1, payload)
		require.Error(t, err)
	}
	_, err = DecodeDamageState(2, b)
	require.Error(t, err)
	var fields map[string]any
	require.NoError(t, json.Unmarshal(b, &fields))
	fields["base"].(map[string]any)["timestamp"] = "bad"
	bad, err := json.Marshal(fields)
	require.NoError(t, err)
	_, err = DecodeDamageState(1, bad)
	require.Error(t, err)
	_, err = (&Damage{SpellData: &chrondbc.Spell{ID: 1}}).CaptureState("")
	require.Error(t, err)
}
