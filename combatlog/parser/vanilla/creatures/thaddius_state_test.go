package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestThaddiusStateOneShotContinuation(t *testing.T) {
	t.Parallel()
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	previous := characters.NewCommonCharacter(guid.GUID(1), all)
	previous.Start("start", messages.TimedOut(at))
	all.All.Add(previous, at)
	common := characters.NewCommonCharacter(guid.GUID(2), all)
	original := &ThaddiusParty{Common: common, all: all, entry: stalaggEntry, buggedPrevious: 1}
	capture := func(*characters.Common) (string, error) { return "common", nil }
	s, e := original.CaptureState(capture, nil)
	require.NoError(t, e)
	b, e := s.Encode()
	require.NoError(t, e)
	s, e = DecodeThaddiusPartyState(ThaddiusPartyStateVersion, b)
	require.NoError(t, e)
	restored := new(ThaddiusParty)
	resolve := func(string) (*characters.Common, error) { return common, nil }
	require.NoError(t, restored.RestoreState(s, all, resolve, nil))
	require.True(t, previous.IsActive())
	require.Equal(t, guid.GUID(1), restored.buggedPrevious)
	require.NoError(t, restored.Process(messages.TimedOut(at.Add(time.Second))))
	require.False(t, previous.IsActive())
	require.Zero(t, restored.buggedPrevious)
	// A capture after the attempt must not repeat it, even if the previous owner
	// becomes active again. Restore never executes Once.Do to mark it consumed.
	s, e = restored.CaptureState(capture, nil)
	require.NoError(t, e)
	previous.Start("next pull", messages.TimedOut(at.Add(2*time.Second)))
	again := new(ThaddiusParty)
	require.NoError(t, again.RestoreState(s, all, resolve, nil))
	require.NoError(t, again.Process(messages.TimedOut(at.Add(3*time.Second))))
	require.True(t, previous.IsActive())
	// Pending death identity remains canonical; failed resolution leaves GUID intact.
	m := messages.Message(messages.TimedOut(at))
	original.pendingDeath = &m
	s, e = original.CaptureState(capture, func(messages.Message) (string, error) { return "death", nil })
	require.NoError(t, e)
	require.Error(t, again.RestoreState(s, all, resolve, func(string) (messages.Message, error) { return nil, nil }))
	require.Zero(t, again.buggedPrevious)
	require.NoError(t, again.RestoreState(s, all, resolve, func(string) (messages.Message, error) { return m, nil }))
	require.Same(t, m, *again.pendingDeath)
}

func TestThaddiusStateConsumesMissingPrevious(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	common := characters.NewCommonCharacter(guid.GUID(2), all)
	original := &ThaddiusParty{Common: common, all: all, entry: stalaggEntry, buggedPrevious: 1}
	capture := func(*characters.Common) (string, error) { return "common", nil }
	state, err := original.CaptureState(capture, nil)
	require.NoError(t, err)
	restored := new(ThaddiusParty)
	resolve := func(string) (*characters.Common, error) { return common, nil }
	require.NoError(t, restored.RestoreState(state, all, resolve, nil))
	require.Equal(t, guid.GUID(1), restored.buggedPrevious)
	// Both uninterrupted and resumed suffixes consume a miss without retrying.
	require.NoError(t, original.Process(messages.TimedOut(at)))
	require.NoError(t, restored.Process(messages.TimedOut(at)))
	require.Zero(t, original.buggedPrevious)
	require.Zero(t, restored.buggedPrevious)
	state, err = restored.CaptureState(capture, nil)
	require.NoError(t, err)
	again := new(ThaddiusParty)
	require.NoError(t, again.RestoreState(state, all, resolve, nil))
	late := characters.NewCommonCharacter(guid.GUID(1), all)
	late.Start("late", messages.TimedOut(at))
	all.All.Add(late, at)
	require.NoError(t, again.Process(messages.TimedOut(at.Add(time.Second))))
	require.True(t, late.IsActive())
	require.NoError(t, original.Process(messages.TimedOut(at.Add(time.Second))))
	require.True(t, late.IsActive())
}
