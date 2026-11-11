package creatures

import (
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestConcreteStatelessOwnersRestoreOnlyReferences(t *testing.T) {
	t.Parallel()
	lookup := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	common := characters.NewCommonCharacter(guid.GUID(1), lookup)
	common.Start("prefix", messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))
	calls := 0
	common.SetPeriodHook(period.HookFunction(func(messages.Message) { calls++ }))
	capture := func(c *characters.Common) (string, error) { require.Same(t, common, c); return "/common", nil }
	resolve := func(ref string) (*characters.Common, error) { require.Equal(t, "/common", ref); return common, nil }
	type owner interface {
		CaptureState(func(*characters.Common) (string, error)) (CommonOwnerState, error)
		RestoreState(CommonOwnerState, func(string) (*characters.Common, error)) error
	}
	for _, pair := range []struct {
		original  owner
		candidate owner
	}{
		{&CoreHound{Common: common}, &CoreHound{}},
		{&Onyxia{Common: common}, &Onyxia{}},
		{&DiseasedGhoul{Common: common}, &DiseasedGhoul{}},
		{&HooktoothFrenzy{Common: common}, &HooktoothFrenzy{}},
		{&coreRager{Common: common}, InitCoreRager()},
	} {
		state, err := pair.original.CaptureState(capture)
		require.NoError(t, err)
		encoded, err := state.Encode()
		require.NoError(t, err)
		decoded, err := DecodeCommonOwnerState(CommonOwnerStateVersion, encoded)
		require.NoError(t, err)
		require.NoError(t, pair.candidate.RestoreState(decoded, resolve))
		require.Zero(t, calls)
		require.True(t, common.IsActive())
		require.Empty(t, lookup.DB().Info)
		require.Zero(t, lookup.All.Len())
		again, err := pair.candidate.CaptureState(capture)
		require.NoError(t, err)
		after, err := again.Encode()
		require.NoError(t, err)
		require.Equal(t, encoded, after)
		require.Error(t, pair.candidate.RestoreState(decoded, func(string) (*characters.Common, error) { return nil, errors.New("missing") }))
		afterState, err := pair.candidate.CaptureState(capture)
		require.NoError(t, err)
		after, err = afterState.Encode()
		require.NoError(t, err)
		require.Equal(t, encoded, after)
	}
	state, err := (&CoreHound{Common: common}).CaptureState(capture)
	require.NoError(t, err)
	invoked := false
	require.Error(t, (&Onyxia{}).RestoreState(state, func(string) (*characters.Common, error) { invoked = true; return common, nil }))
	require.False(t, invoked)
}
func TestConcreteOwnerStateRejectsMalformedPayload(t *testing.T) {
	t.Parallel()
	for _, bad := range []string{`null`, `{}`, `{"owner":"CoreHound","reference":null}`, `{"owner":"CoreHound","reference":""}`, `{"owner":"CoreHound","reference":"/common","reference":"/common"}`, `{"owner":"CoreHound","reference":"/common","extra":true}`, `{"owner":"CoreHound","reference":"/common"} {}`} {
		_, err := DecodeCommonOwnerState(CommonOwnerStateVersion, []byte(bad))
		require.Error(t, err)
	}
	_, err := DecodeCommonOwnerState(CommonOwnerStateVersion+1, []byte(`{"owner":"CoreHound","reference":"/common"}`))
	require.Error(t, err)
}

func TestCommonLookupOwnersRestoreOnlyReferences(t *testing.T) {
	t.Parallel()
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	common := characters.NewCommonCharacter(guid.GUID(1), all)
	type owner interface {
		CaptureState(func(*characters.Common) (string, error)) (CommonOwnerState, error)
		RestoreState(CommonOwnerState, *characters.Characters, func(string) (*characters.Common, error)) error
	}
	for _, pair := range []struct {
		original owner
		restored owner
	}{
		{&sonOfTheFlameCharacter{Common: common, all: all}, InitSonOfTheFlame()},
		{&RazorAdCharacter{Common: common, all: all}, new(RazorAdCharacter)},
		{&FragmentOfRupturan{Common: common, all: all}, new(FragmentOfRupturan)},
	} {
		capture := func(c *characters.Common) (string, error) { require.Same(t, common, c); return "common", nil }
		s, e := pair.original.CaptureState(capture)
		require.NoError(t, e)
		b, e := s.Encode()
		require.NoError(t, e)
		s, e = DecodeCommonOwnerState(CommonOwnerStateVersion, b)
		require.NoError(t, e)
		require.NoError(t, pair.restored.RestoreState(s, all, func(string) (*characters.Common, error) { return common, nil }))
		require.Error(t, pair.restored.RestoreState(s, all, func(string) (*characters.Common, error) { return nil, nil }))
		after, e := pair.restored.CaptureState(capture)
		require.NoError(t, e)
		encoded, e := after.Encode()
		require.NoError(t, e)
		require.Equal(t, b, encoded)
		require.Empty(t, all.ByEntry)
		require.Zero(t, all.All.Len())
		require.Empty(t, all.DB().Info)
	}
}
