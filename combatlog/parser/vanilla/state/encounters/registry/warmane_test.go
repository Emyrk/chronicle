package registry

import (
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	wotlk "github.com/Emyrk/chronicle/combatlog/parser/wotlk/warmane/instances"
	"github.com/stretchr/testify/require"
)

func TestWarmaneStaticRegistryMatchesImplementedFactories(t *testing.T) {
	t.Parallel()

	r := WarmaneStaticRegistry(slog.Default())
	for _, factory := range []*instances.CommonFactory{
		instances.DeadminesFactory,
		instances.ShadowfangKeepFactory,
		instances.WailingCavernsFactory,
		instances.RazorfenKraulFactory,
		instances.ScarletMonasteryCathedralFactory,
		instances.ScarletMonasteryLibraryFactory,
		instances.BlackrockSpireFactory,
		instances.MoltenCoreFactory,
		instances.OnyxiaFactory,
		instances.RagefireChasmFactory,
		instances.ZulGurubFactory,
		instances.BlackrockDepthsFactory,
		instances.ScholomanceFactory,
		instances.TempleOfAhnQirajFactory,
		instances.RuinsOfAhnQirajFactory,
		instances.BlackwingLairFactory,
		instances.StratholmeFactory,
		instances.BlackMorassFactory,
		instances.DireMaulFactory,
		instances.StockadesFactory,
		instances.SunkenTempleFactory,
		instances.ZulFarrakFactory,
		instances.EmeraldSanctumFactory,
		wotlk.NexusFactory,
		wotlk.OculusFactory,
		wotlk.ForgeOfSoulsFactory,
		wotlk.HallsOfReflectionFactory,
		wotlk.VoAFactory,
		wotlk.ObsidianSanctumFactory,
		wotlk.EyeOfEternityFactory,
		wotlk.TrialOfTheCrusaderFactory,
		wotlk.RubySanctumFactory,
		wotlk.NaxxramasFactory,
	} {
		factory := factory
		t.Run(factory.Name, func(t *testing.T) {
			t.Parallel()

			mapID := uint32(0)
			if len(factory.MapIDs) > 0 {
				mapID = factory.MapIDs[0]
			}

			inst := r.GetInstance(false, zone.Zone{Name: factory.ZoneNames[0], MapID: mapID}, nil)
			require.NotNil(t, inst)
			require.Equal(t, factory.Name, inst.Name())
		})
	}
}
