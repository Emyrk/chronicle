package period

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestRetainedACoreCombatBoundaries(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, message := range []messages.Message{
		&messages.UnitCombatEnter{MessageBase: messages.Base(at), UnitGUID: 42, UnitName: "boss", OtherGUID: 17, OtherName: "tank"},
		&messages.UnitEvade{MessageBase: messages.Base(at), UnitGUID: 42, UnitName: "boss", Reason: 4},
	} {
		require.NoError(t, supportedMessage(message))
		state, err := CaptureMessage(message, nil, nil)
		require.NoError(t, err)
		b, err := state.Encode()
		require.NoError(t, err)
		decoded, err := DecodeMessageState(MessageStateVersion, b)
		require.NoError(t, err)
		restored, err := decoded.Restore(nil, nil)
		require.NoError(t, err)
		require.Equal(t, message, restored)
		require.NotSame(t, message, restored)
		r := ownergraph.NewRegistry()
		require.NoError(t, RegisterGraphOwners(r))
		snapshot, err := r.Capture(message)
		require.NoError(t, err)
		a, err := r.Restore(snapshot)
		require.NoError(t, err)
		c, err := r.Restore(snapshot)
		require.NoError(t, err)
		require.Equal(t, message, a)
		require.Equal(t, message, c)
		require.NotSame(t, a, c)
	}
	for _, message := range []messages.Message{(*messages.UnitCombatEnter)(nil), (*messages.UnitEvade)(nil)} {
		require.Error(t, supportedMessage(message))
		_, err := CaptureMessage(message, nil, nil)
		require.Error(t, err)
	}
	for _, payload := range []string{
		`{"kind":"unit_combat_enter","payload":{"base":null,"unit_guid":1,"unit_name":"a","other_guid":2,"other_name":"b"}}`,
		`{"kind":"unit_evade","payload":{"base":{},"unit_guid":1,"unit_name":"a","reason":256}}`,
		`{"kind":"unit_evade","payload":{"base":{},"unit_guid":1,"unit_name":"a"}}`,
	} {
		_, err := DecodeMessageState(MessageStateVersion, []byte(payload))
		require.Error(t, err)
	}
}

// A start and last-active Moment are distinct owners sharing one retained event.
// Restoring the archive must not clone that message once per Moment.
func TestRetainedACoreMessageAliasesAcrossMoments(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, m := range []messages.Message{
		&messages.UnitCombatEnter{MessageBase: messages.Base(at), UnitGUID: 42, OtherGUID: 17},
		&messages.UnitEvade{MessageBase: messages.Base(at), UnitGUID: 42, Reason: 2},
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
	}
}
