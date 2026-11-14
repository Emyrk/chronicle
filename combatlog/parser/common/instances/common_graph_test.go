package instances

import (
	"io"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	vanillacreatures "github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestPreparedCommonGraphMatchesProductionConstruction(t *testing.T) {
	t.Parallel()
	for _, factory := range []*CommonFactory{DeadminesFactory, AllScarletMonasteryFactory, BlackrockSpireFactory, TowerOfKarazhanFactory, NaxxramasFactory} {
		t.Run(factory.Name, func(t *testing.T) {
			t.Parallel()
			flavor := database.WoWFlavor{database.FlavorVanilla}
			format := database.LogFormat112aCcAddon
			ctx := parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: flavor})
			logger := slog.New(slog.NewTextHandler(io.Discard, nil))
			factories := vanillacreatures.VanillaGraphFactoryRecipe(flavor)
			prepared, err := factory.PrepareGraph(format, flavor, factories)
			require.NoError(t, err)
			z := zone.Zone{Name: factory.ZoneNames[0]}
			ordinary := factory.New(ctx, logger, unitdb.New(), z, flavor)
			portable, err := prepared.New(ctx, logger, unitdb.New(), z)
			require.NoError(t, err)
			require.Equal(t, ordinary.name, portable.name)
			require.Equal(t, ordinary.Category, portable.Category)
			require.Equal(t, ordinary.CurrentZone, portable.CurrentZone)
			require.Equal(t, ordinary.activeMapID, portable.activeMapID)
			require.Equal(t, ordinary.derivedName, portable.derivedName)
			require.Equal(t, ordinary.rankingRules, portable.rankingRules)
			require.Equal(t, ordinary.derivedRankingRules, portable.derivedRankingRules)
			require.Len(t, portable.hooks, len(ordinary.hooks))
			require.Len(t, portable.derivedSpeedrunTrackers, len(ordinary.derivedSpeedrunTrackers))
			require.True(t, portable.MatchesZone(z))
		})
	}
}

func TestCommonGraphRejectsUnregisteredFactory(t *testing.T) {
	t.Parallel()
	factory := *DeadminesFactory
	factory.GraphID = ""
	_, err := factory.PrepareGraph(database.LogFormat112aCcAddon, nil, characters.TrustedFactoryRecipe{})
	require.ErrorContains(t, err, "trusted graph metadata")
}

func TestPreparedCommonGraphDetachesStaticRules(t *testing.T) {
	t.Parallel()
	entries := map[uint32]Identity{42: {Name: "configured"}}
	f := &CommonFactory{GraphID: "detached/v1", Name: "test", Hostiles: FromMap(entries), ZoneNames: []string{"test"}}
	p, err := f.PrepareGraph(database.LogFormatAzerothcoreMod, database.WoWFlavor{database.FlavorVanilla}, characters.TrustedFactoryRecipe{})
	require.NoError(t, err)
	// Legacy ACore identifiers may share the factory map. Changing it after
	// preparation must not change either this baseline or a later graph register.
	entries[42] = Identity{Name: "server update", Boss: true}
	a, err := p.Identifier.NewServerClassification()
	require.NoError(t, err)
	b, err := p.Identifier.NewServerClassification()
	require.NoError(t, err)
	require.Equal(t, "configured", a.HostileEntries()[42].Name)
	a.UpdateServerClassification(42, 0, "local update", true)
	require.Equal(t, "configured", b.HostileEntries()[42].Name)
}
