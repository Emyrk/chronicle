package spellsearch_test

import (
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/spellsearch"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSearchExecutesCompiledSQL(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	level := int32(60)
	compiled, err := spellsearch.Compile(uuid.New(), chroniclesdk.SpellSearchRequest{
		Context: chroniclesdk.SpellSearchContext{Level: &level, Difficulty: 2},
		Where: &chroniclesdk.SpellSearchNode{And: []chroniclesdk.SpellSearchNode{
			{Field: "spell.school", Op: chroniclesdk.SpellSearchOpHas, Value: "Frost"},
			{Field: "spell.attributes", Op: chroniclesdk.SpellSearchOpHas, Value: "Channeled"},
			{AnyEffect: &chroniclesdk.SpellSearchNode{Field: "effect.value", Op: chroniclesdk.SpellSearchOpGte, Value: 100}},
			{AnyPower: &chroniclesdk.SpellSearchNode{Field: "power.type", Op: chroniclesdk.SpellSearchOpEq, Value: "Mana"}},
		}},
	}, spellsearch.Options{})
	require.NoError(t, err)

	page, err := spellsearch.Search(testutil.Context(t, testutil.WaitShort), db, compiled, spellsearch.SearchOptions{})
	require.NoError(t, err)
	require.Empty(t, page.Results)
	require.Nil(t, page.Next)
}
