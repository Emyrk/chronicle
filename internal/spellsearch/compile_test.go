package spellsearch_test

import (
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/spellsearch"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestCompileParameterizesValuesAndDataset(t *testing.T) {
	t.Parallel()
	datasetID := uuid.New()
	injection := "%' OR TRUE --"
	compiled, err := spellsearch.Compile(datasetID, chroniclesdk.SpellSearchRequest{Where: &chroniclesdk.SpellSearchNode{
		Field: "spell.name", Op: chroniclesdk.SpellSearchOpContains, Value: injection,
	}}, spellsearch.Options{})
	require.NoError(t, err)
	require.NotContains(t, compiled.SQL, injection)
	require.Contains(t, compiled.Args, injection)
	require.Contains(t, compiled.Args, datasetID)
	require.Contains(t, compiled.SQL, "strpos(lower(s.name), lower($1::text)) > 0")
}

func TestCompileSameRowEffectAndDifficultyFallback(t *testing.T) {
	t.Parallel()
	compiled, err := spellsearch.Compile(uuid.New(), chroniclesdk.SpellSearchRequest{
		Context: chroniclesdk.SpellSearchContext{Difficulty: 3},
		Where: &chroniclesdk.SpellSearchNode{AnyEffect: &chroniclesdk.SpellSearchNode{And: []chroniclesdk.SpellSearchNode{
			{Field: "effect.type", Op: chroniclesdk.SpellSearchOpEq, Value: "Apply aura"},
			{Field: "effect.aura", Op: chroniclesdk.SpellSearchOpEq, Value: "Periodic damage"},
		}}},
	}, spellsearch.Options{})
	require.NoError(t, err)
	require.Equal(t, 1, strings.Count(compiled.SQL, "EXISTS (SELECT 1 FROM dbc_spell_effects e"))
	require.Contains(t, compiled.SQL, "selected_effect.difficulty_id")
	require.Contains(t, compiled.SQL, "THEN")
	require.Contains(t, compiled.SQL, "ELSE 0 END")
	require.Contains(t, compiled.Args, int64(6))
	require.Contains(t, compiled.Args, int64(3))
}

func TestCompileEffectValueFormula(t *testing.T) {
	t.Parallel()
	level := int32(60)
	compiled, err := spellsearch.Compile(uuid.New(), chroniclesdk.SpellSearchRequest{
		Context: chroniclesdk.SpellSearchContext{Level: &level},
		Where: &chroniclesdk.SpellSearchNode{AnyEffect: &chroniclesdk.SpellSearchNode{
			Field: "effect.value", Op: chroniclesdk.SpellSearchOpGte, Value: 100,
		}},
	}, spellsearch.Options{})
	require.NoError(t, err)
	require.Contains(t, compiled.SQL, "e.effect_base_points_f + e.effect_real_points_per_level")
	require.Contains(t, compiled.SQL, "GREATEST(0, LEAST(")
	require.Contains(t, compiled.SQL, "COALESCE(v.max_level, s.max_level) > 0")
	require.Contains(t, compiled.SQL, "COALESCE(v.base_level, s.base_level)")
	require.Contains(t, compiled.Args, int64(60))

	compiled, err = spellsearch.Compile(uuid.New(), chroniclesdk.SpellSearchRequest{
		Where: &chroniclesdk.SpellSearchNode{AnyEffect: &chroniclesdk.SpellSearchNode{Field: "effect.value", Op: chroniclesdk.SpellSearchOpGte, Value: 100}},
	}, spellsearch.Options{})
	require.NoError(t, err)
	require.NotContains(t, compiled.SQL, "effect_real_points_per_level")
	require.Contains(t, compiled.SQL, "e.effect_base_points_f >=")
}

func TestCompileLabelsBitmasksAndCursor(t *testing.T) {
	t.Parallel()
	compiled, err := spellsearch.Compile(uuid.New(), chroniclesdk.SpellSearchRequest{
		Context: chroniclesdk.SpellSearchContext{Difficulty: 2},
		Where: &chroniclesdk.SpellSearchNode{And: []chroniclesdk.SpellSearchNode{
			{Field: "spell.school", Op: chroniclesdk.SpellSearchOpHas, Value: "Frost"},
			{Field: "spell.attributes", Op: chroniclesdk.SpellSearchOpHas, Value: "Channeled"},
			{AnyPower: &chroniclesdk.SpellSearchNode{Field: "power.type", Op: chroniclesdk.SpellSearchOpEq, Value: "Mana"}},
		}},
		Cursor: &chroniclesdk.SpellSearchCursor{SpellID: 123}, Limit: 50,
	}, spellsearch.Options{})
	require.NoError(t, err)
	require.Contains(t, compiled.SQL, "COALESCE(v.school_mask, s.school) &")
	require.Contains(t, compiled.SQL, " OR ")
	require.Contains(t, compiled.SQL, "s.spell_id >")
	require.Contains(t, compiled.Args, int64(16))
	require.Contains(t, compiled.Args, int64(123))
	require.Equal(t, 50, compiled.Limit)
}

func TestCompileValidationAndScope(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name  string
		query chroniclesdk.SpellSearchRequest
		want  string
	}{
		{name: "UnknownField", query: chroniclesdk.SpellSearchRequest{Where: &chroniclesdk.SpellSearchNode{Field: "spell.secret", Op: chroniclesdk.SpellSearchOpEq, Value: 1}}, want: "unknown field"},
		{name: "EffectAtTop", query: chroniclesdk.SpellSearchRequest{Where: &chroniclesdk.SpellSearchNode{Field: "effect.type", Op: chroniclesdk.SpellSearchOpEq, Value: 1}}, want: "effect scope"},
		{name: "SpellInEffect", query: chroniclesdk.SpellSearchRequest{Where: &chroniclesdk.SpellSearchNode{AnyEffect: &chroniclesdk.SpellSearchNode{Field: "spell.id", Op: chroniclesdk.SpellSearchOpEq, Value: 1}}}, want: "spell scope"},
		{name: "NestedQuantifier", query: chroniclesdk.SpellSearchRequest{Where: &chroniclesdk.SpellSearchNode{AnyEffect: &chroniclesdk.SpellSearchNode{AnyPower: &chroniclesdk.SpellSearchNode{Field: "power.cost", Op: chroniclesdk.SpellSearchOpGt, Value: 1}}}}, want: "cannot be nested"},
		{name: "WrongValueType", query: chroniclesdk.SpellSearchRequest{Where: &chroniclesdk.SpellSearchNode{Field: "spell.id", Op: chroniclesdk.SpellSearchOpEq, Value: "one"}}, want: "known label"},
		{name: "TooLargeLimit", query: chroniclesdk.SpellSearchRequest{Limit: 101}, want: "limit"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := spellsearch.Compile(uuid.New(), tc.query, spellsearch.Options{})
			require.ErrorContains(t, err, tc.want)
		})
	}
}
