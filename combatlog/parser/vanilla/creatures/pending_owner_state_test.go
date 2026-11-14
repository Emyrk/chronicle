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

func TestHighPriestThekalPartyStateRetainsPendingMessage(t *testing.T) {
	t.Parallel()
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	common := characters.NewCommonCharacter(guid.GUID(1), all)
	m := messages.Message(messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))
	common.Start("start", m)
	common.LastSlain = m
	original := &HighPriestThekalParty{Common: common, all: all, pendingDeath: &m}
	state, e := original.CaptureState(func(*characters.Common) (string, error) { return "common", nil }, func(msg messages.Message) (string, error) { require.Same(t, m, msg); return "death", nil })
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeHighPriestThekalPartyState(HighPriestThekalPartyStateVersion, data)
	require.NoError(t, e)
	restored := new(HighPriestThekalParty)
	resolve := func(string) (*characters.Common, error) { return common, nil }
	require.NoError(t, restored.RestoreState(state, all, resolve, func(string) (messages.Message, error) { return m, nil }))
	require.Same(t, common, restored.Common)
	require.Same(t, m, *restored.pendingDeath)
	require.True(t, common.IsActive())
	require.Same(t, m, common.LastSlain)
	require.Empty(t, all.DB().Info)
	require.Empty(t, all.ByEntry)
	require.Zero(t, all.All.Len())
	prior := *restored
	require.Error(t, restored.RestoreState(state, all, resolve, func(string) (messages.Message, error) { return (*messages.Slain)(nil), nil }))
	require.Equal(t, prior, *restored)
	_, e = DecodeHighPriestThekalPartyState(HighPriestThekalPartyStateVersion, []byte(`{"common":"common"}`))
	require.Error(t, e)
	original.pendingDeath = nil
	state, e = original.CaptureState(func(*characters.Common) (string, error) { return "common", nil }, nil)
	require.NoError(t, e)
	require.NoError(t, restored.RestoreState(state, all, resolve, nil))
	require.Nil(t, restored.pendingDeath)
}
func TestSneedShredderStateRetainsPendingMessage(t *testing.T) {
	t.Parallel()
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	common := characters.NewCommonCharacter(guid.GUID(1), all)
	m := messages.Message(messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))
	common.Start("start", m)
	common.LastSlain = m
	original := &SneedShredder{Common: common, all: all, pendingDeath: m}
	state, e := original.CaptureState(func(*characters.Common) (string, error) { return "common", nil }, func(msg messages.Message) (string, error) { require.Same(t, m, msg); return "death", nil })
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeSneedShredderState(SneedShredderStateVersion, data)
	require.NoError(t, e)
	restored := new(SneedShredder)
	resolve := func(string) (*characters.Common, error) { return common, nil }
	require.NoError(t, restored.RestoreState(state, all, resolve, func(string) (messages.Message, error) { return m, nil }))
	require.Same(t, common, restored.Common)
	require.Same(t, m, restored.pendingDeath)
	require.True(t, common.IsActive())
	require.Same(t, m, common.LastSlain)
	require.Empty(t, all.DB().Info)
	require.Empty(t, all.ByEntry)
	require.Zero(t, all.All.Len())
	prior := *restored
	require.Error(t, restored.RestoreState(state, all, resolve, func(string) (messages.Message, error) { return (*messages.Slain)(nil), nil }))
	require.Equal(t, prior, *restored)
	_, e = DecodeSneedShredderState(SneedShredderStateVersion, []byte(`{"common":"common"}`))
	require.Error(t, e)
	original.pendingDeath = nil
	state, e = original.CaptureState(func(*characters.Common) (string, error) { return "common", nil }, nil)
	require.NoError(t, e)
	require.NoError(t, restored.RestoreState(state, all, resolve, nil))
	require.Nil(t, restored.pendingDeath)
}
func TestCthunPartyStateRetainsPendingMessage(t *testing.T) {
	t.Parallel()
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	common := characters.NewCommonCharacter(guid.GUID(1), all)
	m := messages.Message(messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))
	common.Start("start", m)
	common.LastSlain = m
	original := &CthunParty{Common: common, all: all, pendingDeath: &m, entry: 123, eyeDone: true}
	state, e := original.CaptureState(func(*characters.Common) (string, error) { return "common", nil }, func(msg messages.Message) (string, error) { require.Same(t, m, msg); return "death", nil })
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeCthunPartyState(CthunPartyStateVersion, data)
	require.NoError(t, e)
	restored := new(CthunParty)
	resolve := func(string) (*characters.Common, error) { return common, nil }
	require.NoError(t, restored.RestoreState(state, all, resolve, func(string) (messages.Message, error) { return m, nil }))
	require.Same(t, common, restored.Common)
	require.Same(t, m, *restored.pendingDeath)
	require.True(t, common.IsActive())
	require.Same(t, m, common.LastSlain)
	require.Empty(t, all.DB().Info)
	require.Empty(t, all.ByEntry)
	require.Zero(t, all.All.Len())
	prior := *restored
	require.Error(t, restored.RestoreState(state, all, resolve, func(string) (messages.Message, error) { return (*messages.Slain)(nil), nil }))
	require.Equal(t, prior, *restored)
	require.Equal(t, uint32(123), restored.entry)
	require.True(t, restored.eyeDone)
	_, e = DecodeCthunPartyState(CthunPartyStateVersion, []byte(`{"common":"common"}`))
	require.Error(t, e)
	original.pendingDeath = nil
	state, e = original.CaptureState(func(*characters.Common) (string, error) { return "common", nil }, nil)
	require.NoError(t, e)
	require.NoError(t, restored.RestoreState(state, all, resolve, nil))
	require.Nil(t, restored.pendingDeath)
}
