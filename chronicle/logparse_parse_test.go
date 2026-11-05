package chronicle

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type staticSpellFetcher struct {
	spell *chrondbc.Spell
}

func (f staticSpellFetcher) Spell(context.Context, chrondbc.SpellID) (*chrondbc.Spell, error) {
	return f.spell, nil
}

func (f staticSpellFetcher) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	return []*chrondbc.Spell{f.spell}, nil
}

func TestOverrideGameDBAppliesScrambledBrainDuration(t *testing.T) {
	t.Parallel()

	stored := &chrondbc.Spell{ID: 57734}
	fetcher := overrideGameDB{
		spells: staticSpellFetcher{spell: stored},
		flavor: database.WoWFlavor{
			database.FlavorVanilla,
			database.FlavorNightmareOfUrsol,
			database.FlavorOctoWoW,
		},
	}

	spell, err := fetcher.Spell(context.Background(), 57734)
	require.NoError(t, err)
	require.Equal(t, int32(10*60*1000), spell.Duration.MaxDuration)
	require.Zero(t, stored.Duration.MaxDuration, "cached dataset spell must not be mutated")
}
