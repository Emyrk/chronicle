package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestMajordomoPartyStateCanonicalReferences(t *testing.T) {
	t.Parallel()
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	common := characters.NewCommonCharacter(guid.GUID(1), all)
	common.Start("prefix", messages.TimedOut(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)))
	calls := 0
	common.SetPeriodHook(period.HookFunction(func(messages.Message) { calls++ }))
	original := &MajordomoParty{Common: common, all: all, isMajordomo: true, announced: true}
	capture := func(c *characters.Common) (string, error) { require.Same(t, common, c); return "/common", nil }
	resolve := func(ref string) (*characters.Common, error) { require.Equal(t, "/common", ref); return common, nil }
	// A repeated reference must stay shared; nil and empty maps must stay distinct.
	for _, party := range []map[guid.GUID]characters.Character{nil, {}, {2: original, 3: original}} {
		original.party = party
		state, err := original.CaptureState(capture, func(c characters.Character) (string, error) { require.Same(t, original, c); return "/party", nil })
		require.NoError(t, err)
		payload, err := state.Encode()
		require.NoError(t, err)
		decoded, err := DecodeMajordomoPartyState(MajordomoPartyStateVersion, payload)
		require.NoError(t, err)
		restored := new(MajordomoParty)
		require.NoError(t, restored.RestoreState(decoded, all, resolve, func(ref string) (characters.Character, error) { require.Equal(t, "/party", ref); return restored, nil }))
		require.Same(t, common, restored.Common)
		require.Same(t, all, restored.all)
		require.True(t, restored.isMajordomo)
		require.True(t, restored.announced)
		require.Equal(t, party == nil, restored.party == nil)
		for id := range party {
			require.Same(t, restored, restored.party[id])
		}
		require.Zero(t, calls)
		require.True(t, common.IsActive())
		require.Zero(t, all.All.Len())
		require.Empty(t, all.ByEntry)
		require.Empty(t, all.DB().Info)
		if len(party) > 0 {
			previous := *restored
			require.Error(t, restored.RestoreState(decoded, all, resolve, func(string) (characters.Character, error) { return (*MajordomoParty)(nil), nil }))
			require.Equal(t, previous, *restored)
		}
	}
	original.party = map[guid.GUID]characters.Character{2: (*MajordomoParty)(nil)}
	_, err := original.CaptureState(capture, func(characters.Character) (string, error) {
		t.Fatal("typed nil must not reach callback")
		return "", nil
	})
	require.Error(t, err)
}

func TestMajordomoPartyStateRejectsMalformed(t *testing.T) {
	t.Parallel()
	for _, payload := range []string{`null`, `{}`, `{"common":""}`, `{"common":"/common","extra":true}`, `{"common":"/common","party":{"2":""}}}`, `{"common":"/common"} {}`} {
		_, err := DecodeMajordomoPartyState(MajordomoPartyStateVersion, []byte(payload))
		require.Error(t, err)
	}
	_, err := DecodeMajordomoPartyState(99, []byte(`{"common":"/common"}`))
	require.Error(t, err)
}

func TestMajordomoPartyStateRequiresCompleteShape(t *testing.T) {
	t.Parallel()
	for _, payload := range []string{
		`{"common":"/common"}`,
		`{"common":"/common","announced":false,"party":{}}`,
		`{"common":"/common","is_majordomo":false,"party":{}}`,
		`{"common":"/common","is_majordomo":false,"announced":false}`,
		`{"common":null,"is_majordomo":false,"announced":false,"party":{}}`,
		`{"common":"/common","is_majordomo":null,"announced":false,"party":{}}`,
		`{"common":"/common","is_majordomo":false,"announced":null,"party":{}}`,
		`{"common":"/common","is_majordomo":false,"announced":false,"party":[]}`,
		`{"common":"/common","is_majordomo":false,"announced":false,"party":{},"party":{}}`,
	} {
		_, err := DecodeMajordomoPartyState(MajordomoPartyStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}
	// Deliberately preserve the nil representation supported by CaptureState.
	state, err := DecodeMajordomoPartyState(MajordomoPartyStateVersion, []byte(`{"common":"/common","is_majordomo":false,"announced":false,"party":null}`))
	require.NoError(t, err)
	require.Nil(t, state.value.Party)
}
