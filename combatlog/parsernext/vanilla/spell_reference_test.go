package vanilla

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/spells"
	"github.com/Emyrk/chronicle/internal/gamedataoverrides"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type referenceFetcher struct {
	calls int
	spell *chrondbc.Spell
	err   error
}

func (f *referenceFetcher) Spell(context.Context, chrondbc.SpellID) (*chrondbc.Spell, error) {
	f.calls++
	return f.spell, f.err
}

func TestSpellReferencesSharedDerivation(t *testing.T) {
	t.Parallel()
	first := &chrondbc.Spell{ID: 123}
	second := &chrondbc.Spell{ID: 123}
	graph, payloads, err := CaptureSpellReferences(map[string]*chrondbc.Spell{"damage": first, "shield": second, "nil": nil})
	require.NoError(t, err)
	require.Len(t, payloads, 1)
	_, ok := graph.Find("/root/references/nil")
	require.False(t, ok)
	fetcher := &referenceFetcher{spell: &chrondbc.Spell{ID: 123, BaseLevel: 42}}
	registration, err := NewSpellDerivation(fetcher)
	require.NoError(t, err)
	require.True(t, registration.Derivable)
	restored, err := registration.Restore(t.Context(), graph, payloads)
	require.NoError(t, err)
	require.Equal(t, 1, fetcher.calls)
	require.Same(t, restored["/root/references/damage"], restored["/root/references/shield"])
	require.Equal(t, int32(42), restored["/root/references/damage"].BaseLevel)
	require.Zero(t, first.BaseLevel)
	require.Zero(t, second.BaseLevel)
	require.Equal(t, int32(42), fetcher.spell.BaseLevel)
	for _, p := range payloads {
		require.JSONEq(t, `{"spell_id":123}`, string(p.Payload))
	}
	encoded, err := json.Marshal(payloads)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "base_level")
	require.NotContains(t, string(encoded), "postgres")
	require.NotContains(t, string(encoded), "password")
	// Compatibility is checked once by the enclosing session. Distinct fixed
	// resolver contexts are not mixed within one restoration or copied into keys.
	other, err := NewSpellDerivation(&referenceFetcher{spell: &chrondbc.Spell{ID: 123, BaseLevel: 99}})
	require.NoError(t, err)
	otherResult, err := other.Restore(t.Context(), graph, payloads)
	require.NoError(t, err)
	require.Equal(t, int32(99), otherResult["/root/references/damage"].BaseLevel)
	require.Equal(t, int32(42), restored["/root/references/damage"].BaseLevel)
}

func TestSpellReferenceLookupSemantics(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name      string
		spell     *chrondbc.Spell
		err       error
		wantError bool
	}{
		{name: "registered synthetic fetched", spell: &chrondbc.Spell{ID: -123, BaseLevel: 17}},
		{name: "not found", err: chrondbc.SpellNotFound(-123)},
		{name: "lookup failure", err: errors.New("unavailable"), wantError: true},
		{name: "nil success", wantError: true},
		{name: "wrong ID", spell: &chrondbc.Spell{ID: 99}, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			graph, payloads, err := CaptureSpellReferences(map[string]*chrondbc.Spell{"a": {ID: -123}, "b": {ID: -123}})
			require.NoError(t, err)
			f := &referenceFetcher{spell: tc.spell, err: tc.err}
			r, err := NewSpellDerivation(f)
			require.NoError(t, err)
			result, err := r.Restore(t.Context(), graph, payloads)
			if tc.wantError {
				require.Error(t, err)
				require.Nil(t, result)
				return
			}
			require.NoError(t, err)
			require.Equal(t, 1, f.calls)
			require.Same(t, result["/root/references/a"], result["/root/references/b"])
			if tc.spell != nil {
				require.Same(t, tc.spell, result["/root/references/a"])
			} else {
				unknown := chrondbc.UnknownSpell(-123)
				require.Equal(t, &unknown, result["/root/references/a"])
			}
		})
	}
}

func TestSpellReferenceRejectsMalformed(t *testing.T) {
	t.Parallel()
	for _, payload := range []string{"null", "{}", "{", `{"spell_id":null}`, `{"spell_id":1,"unknown":2}`, `{"spell_id":1} {}`, `{"spell_id":2147483648}`, `{"spell_id":"1"}`} {
		_, err := DecodeSpellReference(1, []byte(payload))
		require.Error(t, err, payload)
	}
	_, err := DecodeSpellReference(2, []byte(`{"spell_id":1}`))
	require.Error(t, err)
	_, err = NewSpellDerivation(nil)
	require.Error(t, err)
	graph, payloads, err := CaptureSpellReferences(map[string]*chrondbc.Spell{"a": {ID: 1}})
	require.NoError(t, err)
	payloads[stategraph.Path("/root/spells/1")] = stategraph.ValuePayload{Type: SpellReferenceType, Version: 1, Payload: json.RawMessage(`{"spell_id":null}`)}
	f := &referenceFetcher{}
	r, err := NewSpellDerivation(f)
	require.NoError(t, err)
	result, err := r.Restore(t.Context(), graph, payloads)
	require.Error(t, err)
	require.Nil(t, result)
	require.Zero(t, f.calls)
	_, _, err = CaptureSpellReferences(map[string]*chrondbc.Spell{"../bad": {ID: 1}})
	require.Error(t, err)
}

// Mirror the production single-ID wrapper: clone, then ApplySpell. The source
// below is the real custom-first fetcher (nil DB forces any absent ID to miss).
type flavorReferenceFetcher struct {
	source *spells.Fetcher
	flavor database.WoWFlavor
}

func (f flavorReferenceFetcher) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	spell, err := f.source.Spell(ctx, uuid.Nil, id)
	if err != nil {
		return nil, err
	}
	copy := *spell
	gamedataoverrides.ApplySpell(f.flavor, &copy)
	return &copy, nil
}
func TestSpellReferenceConfiguredFlavorAndCustomPrecedence(t *testing.T) {
	t.Parallel()
	source := spells.NewFetcher(nil, map[chrondbc.SpellID]chrondbc.Spell{45708: {ID: 45708, BaseLevel: 17}}, nil, 10)
	graph, payloads, err := CaptureSpellReferences(map[string]*chrondbc.Spell{"spell": {ID: 45708}})
	require.NoError(t, err)
	for _, flavored := range []bool{false, true} {
		flavor := database.WoWFlavor{database.FlavorVanilla}
		if flavored {
			flavor = append(flavor, database.FlavorNightmareOfUrsol)
		}
		// A real session checks its matching flavor/dataset fingerprint before this
		// call. The graph deliberately contains no duplicated compatibility context.
		registration, err := NewSpellDerivation(flavorReferenceFetcher{source: source, flavor: flavor})
		require.NoError(t, err)
		result, err := registration.Restore(t.Context(), graph, payloads)
		require.NoError(t, err)
		spell := result["/root/references/spell"]
		require.Equal(t, int32(17), spell.BaseLevel)
		if flavored {
			require.EqualValues(t, 20000, spell.Duration.MaxDuration)
		} else {
			require.Zero(t, spell.Duration.MaxDuration)
		}
	}
	original, err := source.Spell(t.Context(), uuid.Nil, 45708)
	require.NoError(t, err)
	require.Zero(t, original.Duration.MaxDuration)
}
