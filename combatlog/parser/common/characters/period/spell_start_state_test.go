package period

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestRetainedSpellStartState(t *testing.T) {
	t.Parallel()
	item, target := int32(0), guid.GUID(0)
	sp := chrondbc.UnknownSpell(123)
	for _, base := range []messages.MessageBase{
		{}, messages.Base(time.Unix(100, 0).UTC(), messages.WithSynthetic()),
		(messages.MessageBaseState{Timestamp: time.Unix(100, 0).UTC(), Synthetic: true, MarksPresent: true, Marks: map[messages.MarkType]messages.Mark{messages.MarkTypeBump: {Type: messages.MarkTypeBump, Targets: map[guid.GUID]string{42: "casting"}}}, Activity: map[guid.GUID]messages.ActivityEventType{42: messages.ActivityBump}}).Restore(),
	} {
		original := &messages.SpellStart{MessageBase: base, ItemID: &item, SpellID: 456, SpellData: &sp, Caster: 42, Target: &target, Flags: 3, CastTime: 1500 * time.Millisecond, ChannelDuration: 7 * time.Second, SpellType: 2}
		state, err := CaptureMessage(original, nil, func(got *chrondbc.Spell) (string, error) { require.Same(t, &sp, got); return "spell", nil })
		require.NoError(t, err)
		wire, err := state.Encode()
		require.NoError(t, err)
		decoded, err := DecodeMessageState(MessageStateVersion, wire)
		require.NoError(t, err)
		restored, err := decoded.Restore(nil, func(path string) (*chrondbc.Spell, error) { require.Equal(t, "spell", path); return &sp, nil })
		require.NoError(t, err)
		got := restored.(*messages.SpellStart)
		require.Equal(t, original, got)
		require.Same(t, &sp, got.SpellData)
		require.NotSame(t, original.ItemID, got.ItemID)
		require.NotSame(t, original.Target, got.Target)
		for _, resolve := range []func(string) (*chrondbc.Spell, error){nil, func(string) (*chrondbc.Spell, error) { return nil, nil }, func(string) (*chrondbc.Spell, error) { return nil, errors.New("missing") }} {
			_, err = decoded.Restore(nil, resolve)
			require.Error(t, err)
		}
		for _, field := range []string{"spell_path", "item_id", "spell_id", "caster", "target", "flags", "cast_time", "channel_duration", "spell_type", "base"} {
			var outer map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(wire, &outer))
			var payload map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(outer["payload"], &payload))
			delete(payload, field)
			outer["payload"], err = json.Marshal(payload)
			require.NoError(t, err)
			bad, err := json.Marshal(outer)
			require.NoError(t, err)
			_, err = DecodeMessageState(MessageStateVersion, bad)
			require.Error(t, err, field)
		}
		_, err = DecodeMessageState(MessageStateVersion, bytes.Replace(wire, []byte(`"spell_start"`), []byte(`"future_kind"`), 1))
		require.Error(t, err)
	}
	for _, capture := range []func(*chrondbc.Spell) (string, error){nil, func(*chrondbc.Spell) (string, error) { return "", nil }, func(*chrondbc.Spell) (string, error) { return "", errors.New("missing") }} {
		_, err := CaptureMessage(&messages.SpellStart{SpellData: &sp}, nil, capture)
		require.Error(t, err)
	}
	require.Error(t, supportedMessage((*messages.SpellStart)(nil)))
	_, err := CaptureMessage((*messages.SpellStart)(nil), nil, nil)
	require.Error(t, err)
	state, err := CaptureMessage(&messages.SpellStart{SpellID: 456}, nil, nil)
	require.NoError(t, err)
	got, err := state.Restore(nil, nil)
	require.NoError(t, err)
	require.Equal(t, &messages.SpellStart{SpellID: 456}, got)
}

func TestRetainedSpellStartGraphAliases(t *testing.T) {
	t.Parallel()
	at := time.Unix(100, 0).UTC()
	sp := chrondbc.UnknownSpell(123)
	m := &messages.SpellStart{MessageBase: messages.Base(at), Caster: 42, SpellData: &sp, SpellID: 123, CastTime: time.Second}
	p := NewInactivityPeriod(42, time.Minute)
	p.Begin("casting", m)
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r))
	require.NoError(t, ownergraph.Register(r, ownergraph.Codec[chrondbc.Spell]{Type: "test.spell", Version: 1, Init: func() *chrondbc.Spell { return new(chrondbc.Spell) }, Capture: func(s *chrondbc.Spell, _ *ownergraph.Capture) ([]byte, error) {
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
	graph, err := r.Capture(p)
	require.NoError(t, err)
	// Round-trip the archive, not live pointers.
	wire, err := json.Marshal(graph)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &disk))
	root, err := r.Restore(disk)
	require.NoError(t, err)
	fresh := root.(*InactivityPeriod)
	require.Same(t, fresh.Start.Timestamp, fresh.LastActive.Timestamp)
	require.NotSame(t, m, fresh.Start.Timestamp)
	require.Equal(t, m, fresh.Start.Timestamp)
	require.NotSame(t, &sp, fresh.Start.Timestamp.(*messages.SpellStart).SpellData)
	second, err := r.Restore(disk)
	require.NoError(t, err)
	require.NotSame(t, fresh.Start.Timestamp, second.(*InactivityPeriod).Start.Timestamp)
}

// Distinct retained events must share their one canonical prepared spell owner.
func TestRetainedSpellStartSharesSpellWithSpellGo(t *testing.T) {
	t.Parallel()
	sp := chrondbc.UnknownSpell(123)
	at := time.Unix(100, 0).UTC()
	start := &messages.SpellStart{MessageBase: messages.Base(at), Caster: 42, SpellData: &sp}
	goEvent := &messages.SpellGo{MessageBase: messages.Base(at.Add(time.Second)), Caster: 42, SpellData: &sp}
	p := NewInactivityPeriod(42, time.Minute)
	p.Begin("start", start)
	p.Bump("go", goEvent)
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r))
	require.NoError(t, ownergraph.Register(r, ownergraph.Codec[chrondbc.Spell]{Type: "test.spell", Version: 1, Init: func() *chrondbc.Spell { return new(chrondbc.Spell) }, Capture: func(s *chrondbc.Spell, _ *ownergraph.Capture) ([]byte, error) { return json.Marshal(s.ID) }, Restore: func(s *chrondbc.Spell, _ uint32, b []byte, _ *ownergraph.Restore) error {
		var id chrondbc.SpellID
		if err := json.Unmarshal(b, &id); err != nil {
			return err
		}
		*s = chrondbc.UnknownSpell(id)
		return nil
	}}))
	graph, err := r.Capture(p)
	require.NoError(t, err)
	root, err := r.Restore(graph)
	require.NoError(t, err)
	fresh := root.(*InactivityPeriod)
	first := fresh.Start.Timestamp.(*messages.SpellStart)
	last := fresh.LastActive.Timestamp.(*messages.SpellGo)
	require.Same(t, first.SpellData, last.SpellData)
	require.NotSame(t, &sp, first.SpellData)
}
