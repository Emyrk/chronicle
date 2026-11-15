package period

import (
	"bytes"
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

// A start and last-active Moment are distinct owners sharing one retained event.
// Restoring the archive must not clone that message once per Moment.
func TestRetainedTotemMessageAliasesAcrossMoments(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, m := range []messages.Message{
		&messages.ResourceChange{MessageBase: messages.Base(at), Target: 17, Amount: 30, OverResource: 4},
		&messages.Heal{MessageBase: messages.Base(at), Caster: 42, Target: 17, Amount: 50, Overheal: 10, Absorbed: 3},
		&messages.Dispel{MessageBase: messages.Base(at), Caster: 42, Target: 17},
		&messages.SpellGo{MessageBase: messages.Base(at), Caster: 42, SpellID: 45513, NumTargetsHit: 1, NumTargetsMissed: 2},
	} {
		activity := NewInactivityPeriod(42, time.Minute)
		activity.Begin("retained boundary", m)
		require.NotSame(t, activity.Start, activity.LastActive)
		require.Same(t, activity.Start.Timestamp, activity.LastActive.Timestamp)
		r := ownergraph.NewRegistry()
		require.NoError(t, RegisterGraphOwners(r))
		graph, err := r.Capture(activity)
		require.NoError(t, err)
		wire, err := json.Marshal(graph)
		require.NoError(t, err)
		var disk ownergraph.Snapshot
		require.NoError(t, json.Unmarshal(wire, &disk))
		first, err := r.Restore(disk)
		require.NoError(t, err)
		second, err := r.Restore(disk)
		require.NoError(t, err)
		a, b := first.(*InactivityPeriod), second.(*InactivityPeriod)
		require.NotSame(t, a.Start, a.LastActive)
		require.Same(t, a.Start.Timestamp, a.LastActive.Timestamp)
		require.Same(t, b.Start.Timestamp, b.LastActive.Timestamp)
		require.NotSame(t, a.Start.Timestamp, b.Start.Timestamp)
		require.NotSame(t, m, a.Start.Timestamp)
		require.Equal(t, m, a.Start.Timestamp)
		require.Equal(t, at, a.Start.Timestamp.Date())
		suffix := messages.TimedOut(at.Add(10 * time.Second))
		activity.Bump("continued", suffix)
		a.Bump("continued", suffix)
		activity.Timeout("final timeout", at.Add(2*time.Minute))
		a.Timeout("final timeout", at.Add(2*time.Minute))
		require.Equal(t, activity.Get(), a.Get())
	}
}

func TestRetainedTotemMessagePayloads(t *testing.T) {
	t.Parallel()
	sp := &chrondbc.Spell{}
	caster, name, item := guid.GUID(42), "resource", int32(7)
	for _, m := range []messages.Message{
		&messages.ResourceChange{Caster: &caster, SpellName: &name, SpellData: sp, Amount: 123, OverResource: 45, Resource: "mana", Direction: "gain"},
		&messages.Heal{SpellData: sp, SpellName: name, HitType: 2, School: 4},
		&messages.Dispel{Spell: sp},
		&messages.SpellGo{SpellData: sp, SpellID: 45513, ItemID: &item, Target: &caster, CorpseOwner: &caster, Flags: 3},
	} {
		_, err := CaptureMessage(m, nil, nil)
		require.Error(t, err)
		state, err := CaptureMessage(m, nil, func(got *chrondbc.Spell) (string, error) { require.Same(t, sp, got); return "spell", nil })
		require.NoError(t, err)
		wire, err := state.Encode()
		require.NoError(t, err)
		decoded, err := DecodeMessageState(MessageStateVersion, wire)
		require.NoError(t, err)
		_, err = decoded.Restore(nil, nil)
		require.Error(t, err)
		_, err = decoded.Restore(nil, func(string) (*chrondbc.Spell, error) { return nil, nil })
		require.Error(t, err)
		restored, err := decoded.Restore(nil, func(path string) (*chrondbc.Spell, error) { require.Equal(t, "spell", path); return sp, nil })
		require.NoError(t, err)
		require.Equal(t, m, restored)
		for _, bad := range [][]byte{
			bytes.Replace(wire, []byte(`"spell_path":"spell"`), []byte(`"spell_path":null`), 1),
			bytes.Replace(wire, []byte(`"spell_path":"spell",`), nil, 1),
			bytes.Replace(wire, []byte(`"spell_path":"spell"`), []byte(`"spell_path":"spell","extra":1`), 1),
		} {
			_, err := DecodeMessageState(MessageStateVersion, bad)
			require.Error(t, err)
		}
	}
	for _, m := range []messages.Message{(*messages.ResourceChange)(nil), (*messages.Heal)(nil), (*messages.Dispel)(nil), (*messages.SpellGo)(nil)} {
		require.Error(t, supportedMessage(m))
		_, err := CaptureMessage(m, nil, nil)
		require.Error(t, err)
	}
}
