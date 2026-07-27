package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestLevel60Cap(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name   string
		flavor database.WoWFlavor
		capped bool
	}{
		{name: "vanilla", flavor: database.WoWFlavor{database.FlavorVanilla}},
		{name: "tbc", flavor: database.WoWFlavor{database.FlavorTBC}, capped: true},
		{name: "wrath", flavor: database.WoWFlavor{database.FlavorWrath}, capped: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			requirement := Level60Cap(tc.flavor)
			if !tc.capped {
				require.Nil(t, requirement)
				return
			}

			require.NotNil(t, requirement)
			require.Equal(t, int32(0), requirement.MinLevel)
			require.Equal(t, int32(60), requirement.MaxLevel)
		})
	}
}

func TestVanillaRaidLevel60Caps(t *testing.T) {
	t.Parallel()

	factories := []*CommonFactory{
		MoltenCoreFactory,
		OnyxiaFactory,
		ZulGurubFactory,
		TempleOfAhnQirajFactory,
		RuinsOfAhnQirajFactory,
		BlackwingLairFactory,
		NaxxramasFactory,
	}

	for _, factory := range factories {
		factory := factory
		t.Run(factory.Name, func(t *testing.T) {
			t.Parallel()

			for _, flavor := range []database.FlavorTag{database.FlavorTBC, database.FlavorWrath} {
				rules := factory.FlavoredRankings(database.WoWFlavor{flavor})
				require.NotNil(t, rules)
				require.NotNil(t, rules.Speedrun)
				require.NotNil(t, rules.Speedrun.LevelRange, "flavor %q", flavor)
				require.Equal(t, int32(60), rules.Speedrun.LevelRange.MaxLevel, "flavor %q", flavor)
			}

			vanillaRules := factory.FlavoredRankings(database.WoWFlavor{database.FlavorVanilla})
			require.Nil(t, vanillaRules.Speedrun.LevelRange)
		})
	}
}
