package identifier_test

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func creature(entry uint32) guid.GUID { return guid.GUID(0xF130000000000001 | uint64(entry)<<24) }
func stateBytes(t *testing.T, i *identifier.Identifier) []byte {
	t.Helper()
	s, err := i.CaptureState()
	require.NoError(t, err)
	b, err := s.Encode()
	require.NoError(t, err)
	return b
}
func TestStaticRecipeContinuation(t *testing.T) {
	t.Parallel()
	calls := 0
	recipe := identifier.TrustedRecipe{ID: "instance/blackwing-lair", Factory: func() *identifier.Identifier {
		calls++
		return instances.BlackwingLairHostiles(database.WoWFlavor{database.FlavorVanillaPlus})
	}}
	original, err := recipe.New()
	require.NoError(t, err)
	require.Equal(t, 1, calls)
	original.IdentifyUnit(creature(999999))
	original.IdentifyUnit(creature(999999))
	snapshot, err := original.CaptureState()
	require.NoError(t, err)
	encoded, err := snapshot.Encode()
	require.NoError(t, err)
	decoded, err := identifier.DecodeState(identifier.StateVersion, encoded)
	require.NoError(t, err)
	restored, err := decoded.Restore(recipe)
	require.NoError(t, err)
	require.Equal(t, 2, calls)
	for _, i := range []*identifier.Identifier{original, restored} {
		i.IdentifyUnit(creature(999999))
		i.IdentifyUnit(creature(888888))
		i.IdentifyUnit(creature(2914))
		i.IdentifyUnit(creature(5925))
		i.IdentifyUnit(creature(11859))
		boss := i.IdentifyUnit(creature(14601))
		require.True(t, boss.Boss)
		require.Equal(t, "Ebonroc", boss.Name)
		require.NotNil(t, boss.EncounterNameFn)
		require.Nil(t, boss.EncounterNameFn(encounter.Fight{}))
		ordinary := i.IdentifyUnit(creature(11583))
		require.True(t, ordinary.Boss)
		require.Equal(t, "Nefarian", ordinary.EncounterName)
		require.Nil(t, ordinary.EncounterNameFn)
	}
	require.Equal(t, stateBytes(t, original), stateBytes(t, restored))
	require.Equal(t, map[uint32]int{999999: 3, 888888: 1}, restored.UnknownUnits())
	restored.UnknownUnits()[999999] = 99
	after, err := snapshot.Encode()
	require.NoError(t, err)
	require.Equal(t, encoded, after)
	again, err := decoded.Restore(recipe)
	require.NoError(t, err)
	require.Equal(t, 2, again.UnknownUnits()[999999])
}

func TestRecipeRejectsUnboundDynamicAndVisibleDrift(t *testing.T) {
	t.Parallel()
	bare := identifier.NewIdentifier(map[uint32]identifier.Identity{})
	_, err := bare.CaptureState()
	require.Error(t, err)
	recipe := identifier.TrustedRecipe{ID: "test/static", Factory: func() *identifier.Identifier {
		return identifier.NewIdentifier(map[uint32]identifier.Identity{1: {Name: "original"}})
	}}
	for _, change := range []func(*identifier.Identifier){
		func(i *identifier.Identifier) { i.AddEntryId(1, identifier.Identity{Name: "original"}) },
		func(i *identifier.Identifier) { i.HostileEntries()[1] = identifier.Identity{Name: "changed"} },
		func(i *identifier.Identifier) {
			i.HostileEntries()[1] = identifier.Identity{Name: "original", EncounterNameFn: func(encounter.Fight) *identifier.EncounterFuncResult { return nil }}
		},
	} {
		i, err := recipe.New()
		require.NoError(t, err)
		change(i)
		_, err = i.CaptureState()
		require.Error(t, err)
	}
	s := func() identifier.State {
		i, err := recipe.New()
		require.NoError(t, err)
		s, err := i.CaptureState()
		require.NoError(t, err)
		return s
	}()
	invoked := false
	wrong := identifier.TrustedRecipe{ID: "wrong", Factory: func() *identifier.Identifier { invoked = true; return bare }}
	candidate, err := s.Restore(wrong)
	require.Error(t, err)
	require.Nil(t, candidate)
	require.False(t, invoked)
	wrong.ID = recipe.ID
	wrong.Factory = func() *identifier.Identifier { invoked = true; return identifier.NewIdentifier(nil) }
	candidate, err = s.Restore(wrong)
	require.Error(t, err)
	require.Nil(t, candidate)
	require.True(t, invoked)
	for _, bad := range []identifier.TrustedRecipe{{}, {ID: "missing"}, {ID: "nil", Factory: func() *identifier.Identifier { return nil }}, {ID: "used", Factory: func() *identifier.Identifier {
		i := identifier.NewIdentifier(nil)
		i.IdentifyUnit(creature(999999))
		return i
	}}, {ID: "dynamic", Factory: func() *identifier.Identifier {
		i := identifier.NewIdentifier(map[uint32]identifier.Identity{})
		i.AddEntryId(1, identifier.Identity{})
		return i
	}}} {
		candidate, err := bad.New()
		require.Error(t, err)
		require.Nil(t, candidate)
	}
}

func TestRecipeDetachesFactoryMapAndPreservesDefaults(t *testing.T) {
	t.Parallel()
	entries := map[uint32]identifier.Identity{1: {}}
	factoryObject := identifier.NewIdentifier(entries)
	recipe := identifier.TrustedRecipe{ID: "empty-default", Factory: func() *identifier.Identifier { return factoryObject }}
	first, err := recipe.New()
	require.NoError(t, err)
	state, err := first.CaptureState()
	require.NoError(t, err)
	second, err := state.Restore(recipe)
	require.NoError(t, err)
	second.IdentifyUnit(creature(999999))
	require.Empty(t, factoryObject.UnknownUnits())
	require.Empty(t, first.UnknownUnits())
	second.HostileEntries()[1] = identifier.Identity{Name: "changed"}
	require.Equal(t, identifier.Identity{}, entries[1])
	require.Equal(t, identifier.Identity{}, first.HostileEntries()[1])
	nilRecipe := identifier.TrustedRecipe{ID: "nil-map", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	empty, err := nilRecipe.New()
	require.NoError(t, err)
	require.Nil(t, empty.HostileEntries())
}

func TestIdentifierDecodeRejectsMalformedState(t *testing.T) {
	t.Parallel()
	recipe := identifier.TrustedRecipe{ID: "static", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	i, err := recipe.New()
	require.NoError(t, err)
	good := stateBytes(t, i)
	for _, mutation := range []func(map[string]any){
		func(v map[string]any) { delete(v, "unknown_units") }, func(v map[string]any) { v["extra"] = 1 }, func(v map[string]any) { v["recipe_id"] = nil }, func(v map[string]any) { v["configuration"] = "bad" }, func(v map[string]any) { v["unknown_units"] = map[string]any{"5": nil} }, func(v map[string]any) { v["unknown_units"] = map[string]any{"4294967296": 1} },
	} {
		var v map[string]any
		require.NoError(t, json.Unmarshal(good, &v))
		mutation(v)
		bad, err := json.Marshal(v)
		require.NoError(t, err)
		_, err = identifier.DecodeState(identifier.StateVersion, bad)
		require.Error(t, err)
	}
	for _, bad := range [][]byte{[]byte("null"), []byte(`{"recipe_id":"a","recipe_id":"b"}`), append(append([]byte{}, good...), []byte(" {}")...)} {
		_, err := identifier.DecodeState(identifier.StateVersion, bad)
		require.Error(t, err)
	}
	_, err = identifier.DecodeState(identifier.StateVersion+1, good)
	require.Error(t, err)
}

func TestExistingStaticCallbacksReconstructed(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		id           string
		factory      func() *identifier.Identifier
		entry        uint32
		participants []uint32
		expected     *identifier.EncounterFuncResult
	}{
		{"instance/blackwing-lair", func() *identifier.Identifier {
			return instances.BlackwingLairHostiles(database.WoWFlavor{database.FlavorVanilla})
		}, 14601, []uint32{14601, 11981}, &identifier.EncounterFuncResult{EncounterName: "Flamegor & Ebonroc"}},
		{"instance/emerald-sanctum", instances.FromMaps(instances.EmeraldSanctumHostiles()), 60747, []uint32{60747, 60748}, &identifier.EncounterFuncResult{EncounterName: "Solnius (Hard Mode)"}},
		{"instance/tower-of-karazhan", instances.FromMaps(instances.TowerOfKarazhanHostiles()), 59953, nil, &identifier.EncounterFuncResult{EncounterName: "King", Bosses: []uint32{59967}}},
	} {
		t.Run(tc.id, func(t *testing.T) {
			t.Parallel()
			recipe := identifier.TrustedRecipe{ID: tc.id, Factory: tc.factory}
			first, err := recipe.New()
			require.NoError(t, err)
			snapshot, err := first.CaptureState()
			require.NoError(t, err)
			encoded, err := snapshot.Encode()
			require.NoError(t, err)
			state, err := identifier.DecodeState(identifier.StateVersion, encoded)
			require.NoError(t, err)
			restored, err := state.Restore(recipe)
			require.NoError(t, err)
			fight := encounter.Fight{Hostiles: make(map[guid.GUID]encounter.CharacterFight)}
			for _, entry := range tc.participants {
				id := creature(entry)
				fight.Hostiles[id] = encounter.CharacterFight{ID: id}
			}
			for _, i := range []*identifier.Identifier{first, restored} {
				fn := i.IdentifyUnit(creature(tc.entry)).EncounterNameFn
				require.NotNil(t, fn)
				require.Equal(t, tc.expected, fn(fight))
				require.Equal(t, tc.expected, fn(fight), "repeated calls must preserve factory behavior")
			}
		})
	}
}
