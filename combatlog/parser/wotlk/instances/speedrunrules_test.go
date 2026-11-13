package instances

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/database"
)

func TestUlduarSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	rules := UlduarFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.NotNil(t, rules)
	require.Equal(t, rankings.DamageRuleAssemblyOfIron, rules.Damage)
	require.NotNil(t, rules.Speedrun)
	require.Equal(t, "Flame Leviathan", rules.Speedrun.RankedStartAfterRequirement)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Flame Leviathan", EntryIDs: []uint32{33113, 34003}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ignis the Furnace Master", EntryIDs: []uint32{33118, 33190}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Razorscale", EntryIDs: []uint32{33186, 33724}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "XT-002 Deconstructor", EntryIDs: []uint32{33293, 33885}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Assembly of Iron", EntryIDs: []uint32{32857, 32867, 32927, 33692, 33693, 33694}, Count: 3, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Kologarn", EntryIDs: []uint32{32930, 33909}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Auriaya", EntryIDs: []uint32{33515, 34175}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Hodir", EntryIDs: []uint32{32845, 32846}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Thorim", EntryIDs: []uint32{32865, 33147}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Freya", EntryIDs: []uint32{32906, 33360}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Mimiron", EntryIDs: []uint32{33432, 34106, 33651, 33670}, Count: 3, Category: rankings.SpeedrunCategoryBosses},
		{Name: "General Vezax", EntryIDs: []uint32{33271, 33449}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Yogg-Saron", EntryIDs: []uint32{33288}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Algalon the Observer", EntryIDs: []uint32{32871}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, rules.Speedrun.Requirements)
}

func TestRubySanctumSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	rules := RubySanctumFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.NotNil(t, rules)
	require.NotNil(t, rules.Speedrun)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Baltharus the Warborn", EntryIDs: []uint32{39751, 39920}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Saviana Ragefire", EntryIDs: []uint32{39747, 39823}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "General Zarithrian", EntryIDs: []uint32{39746, 39805}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Halion", EntryIDs: []uint32{39863, 39864, 39944, 39945, 40142, 40143, 40144, 40145}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, rules.Speedrun.Requirements)
}

func TestRubySanctumProgressionBosses(t *testing.T) {
	t.Parallel()

	require.Equal(t, []string{
		"Baltharus the Warborn",
		"Saviana Ragefire",
		"General Zarithrian",
		"Halion",
	}, RubySanctumFactory.ProgressionBosses(database.WoWFlavor{database.FlavorWrath}))
}

func TestIcecrownCitadelSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	rules := IcecrownCitadelFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.NotNil(t, rules)
	require.NotNil(t, rules.Speedrun)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Lord Marrowgar", EntryIDs: []uint32{36612}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Lady Deathwhisper", EntryIDs: []uint32{36855}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Gunship Battle", EntryIDs: []uint32{37215, 37540}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Deathbringer Saurfang", EntryIDs: []uint32{37813}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Festergut", EntryIDs: []uint32{36626}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Rotface", EntryIDs: []uint32{36627}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Professor Putricide", EntryIDs: []uint32{36678}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Blood Council", EntryIDs: []uint32{37970, 37972, 37973}, Count: 3, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Blood-Queen Lana'thel", EntryIDs: []uint32{37955}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Valithria Dreamwalker", EntryIDs: []uint32{36789}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Sindragosa", EntryIDs: []uint32{36853}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "The Lich King", EntryIDs: []uint32{36597}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, rules.Speedrun.Requirements)
}

func TestIcecrownCitadelProgressionBosses(t *testing.T) {
	t.Parallel()

	require.Equal(t, []string{
		"Lord Marrowgar",
		"Lady Deathwhisper",
		"Gunship Battle",
		"Deathbringer Saurfang",
		"Festergut",
		"Rotface",
		"Professor Putricide",
		"Blood Council",
		"Blood-Queen Lana'thel",
		"Valithria Dreamwalker",
		"Sindragosa",
		"The Lich King",
	}, IcecrownCitadelFactory.ProgressionBosses(database.WoWFlavor{database.FlavorWrath}))
}

func TestUlduarProgressionBosses(t *testing.T) {
	t.Parallel()

	require.Equal(t, []string{
		"Flame Leviathan",
		"Ignis the Furnace Master",
		"Razorscale",
		"XT-002 Deconstructor",
		"Assembly of Iron",
		"Kologarn",
		"Auriaya",
		"Hodir",
		"Thorim",
		"Freya",
		"Mimiron",
		"General Vezax",
		"Yogg-Saron",
		"Algalon the Observer",
	}, UlduarFactory.ProgressionBosses(database.WoWFlavor{database.FlavorWrath}))
}

func TestUlduarOptionalEldersRemainBossesButAreNotRequired(t *testing.T) {
	t.Parallel()

	rules := UlduarFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.NotNil(t, rules)
	hostiles := UlduarHostiles()
	for _, entry := range []uint32{32913, 32914, 32915, 33391, 33392, 33393} {
		require.Contains(t, hostiles, entry)
		require.True(t, hostiles[entry].Boss)
		for _, requirement := range rules.Speedrun.Requirements {
			require.NotEqual(t, hostiles[entry].EncounterName, requirement.Name)
		}
	}
}

func TestKarazhanSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	tbcRules := KarazhanFactory.FlavoredRankings(database.WoWFlavor{database.FlavorTBC})
	require.NotNil(t, tbcRules)
	require.NotNil(t, tbcRules.Speedrun)
	require.Nil(t, tbcRules.Speedrun.LevelRange)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Attumen the Huntsman", EntryIDs: []uint32{15550, 16151, 16152}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Moroes", EntryIDs: []uint32{15687}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Maiden of Virtue", EntryIDs: []uint32{16457}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Nightbane", EntryIDs: []uint32{17225}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "The Curator", EntryIDs: []uint32{15691}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Terestian Illhoof", EntryIDs: []uint32{15688}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Shade of Aran", EntryIDs: []uint32{16524}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Netherspite", EntryIDs: []uint32{15689}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Prince Malchezaar", EntryIDs: []uint32{15690}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, tbcRules.Speedrun.Requirements)

	wrathRules := KarazhanFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.Equal(t, &rankings.LevelRangeRequirement{MinLevel: 0, MaxLevel: 70}, wrathRules.Speedrun.LevelRange)
}

func TestSerpentshrineCavernSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	tbcRules := SerpentshrineCavernFactory.FlavoredRankings(database.WoWFlavor{database.FlavorTBC})
	require.NotNil(t, tbcRules)
	require.NotNil(t, tbcRules.Speedrun)
	require.Nil(t, tbcRules.Speedrun.LevelRange)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Hydross the Unstable", EntryIDs: []uint32{21216}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "The Lurker Below", EntryIDs: []uint32{21217}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Leotheras the Blind", EntryIDs: []uint32{21215}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Fathom-Lord Karathress", EntryIDs: []uint32{21214}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Morogrim Tidewalker", EntryIDs: []uint32{21213}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Lady Vashj", EntryIDs: []uint32{21212}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, tbcRules.Speedrun.Requirements)

	wrathRules := SerpentshrineCavernFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.Equal(t, &rankings.LevelRangeRequirement{
		MinLevel: 0,
		MaxLevel: 70,
	}, wrathRules.Speedrun.LevelRange)
}

func TestTempestKeepSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	tbcRules := TempestKeepFactory.FlavoredRankings(database.WoWFlavor{database.FlavorTBC})
	require.NotNil(t, tbcRules)
	require.NotNil(t, tbcRules.Speedrun)
	require.Nil(t, tbcRules.Speedrun.LevelRange)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Al'ar", EntryIDs: []uint32{19514}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Void Reaver", EntryIDs: []uint32{19516}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "High Astromancer Solarian", EntryIDs: []uint32{18805}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Kael'thas Sunstrider", EntryIDs: []uint32{19622}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, tbcRules.Speedrun.Requirements)

	wrathRules := TempestKeepFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.Equal(t, &rankings.LevelRangeRequirement{
		MinLevel: 0,
		MaxLevel: 70,
	}, wrathRules.Speedrun.LevelRange)
}

func TestHyjalSummitSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	tbcRules := HyjalSummitFactory.FlavoredRankings(database.WoWFlavor{database.FlavorTBC})
	require.NotNil(t, tbcRules)
	require.NotNil(t, tbcRules.Speedrun)
	require.Nil(t, tbcRules.Speedrun.LevelRange)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Rage Winterchill", EntryIDs: []uint32{17767}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Anetheron", EntryIDs: []uint32{17808}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Kaz'rogal", EntryIDs: []uint32{17888}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Azgalor", EntryIDs: []uint32{17842}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Archimonde", EntryIDs: []uint32{17968}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, tbcRules.Speedrun.Requirements)

	wrathRules := HyjalSummitFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.Equal(t, &rankings.LevelRangeRequirement{MinLevel: 0, MaxLevel: 70}, wrathRules.Speedrun.LevelRange)
}

func TestZulAmanSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	tbcRules := ZulAmanFactory.FlavoredRankings(database.WoWFlavor{database.FlavorTBC})
	require.NotNil(t, tbcRules)
	require.NotNil(t, tbcRules.Speedrun)
	require.Nil(t, tbcRules.Speedrun.LevelRange)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Akil'zon", EntryIDs: []uint32{23574}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Nalorakk", EntryIDs: []uint32{23576}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Jan'alai", EntryIDs: []uint32{23578}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Halazzi", EntryIDs: []uint32{23577}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Hex Lord Malacrass", EntryIDs: []uint32{24239}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Zul'jin", EntryIDs: []uint32{23863}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, tbcRules.Speedrun.Requirements)

	wrathRules := ZulAmanFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.Equal(t, &rankings.LevelRangeRequirement{MinLevel: 0, MaxLevel: 70}, wrathRules.Speedrun.LevelRange)
}

func TestGruulsLairSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	tbcRules := GruulsLairFactory.FlavoredRankings(database.WoWFlavor{database.FlavorTBC})
	require.NotNil(t, tbcRules)
	require.NotNil(t, tbcRules.Speedrun)
	require.Nil(t, tbcRules.Speedrun.LevelRange)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "High King Maulgar", EntryIDs: []uint32{18831}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Krosh Firehand", EntryIDs: []uint32{18832}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Olm the Summoner", EntryIDs: []uint32{18834}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Kiggler the Crazed", EntryIDs: []uint32{18835}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Blindeye the Seer", EntryIDs: []uint32{18836}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Gruul the Dragonkiller", EntryIDs: []uint32{19044}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, tbcRules.Speedrun.Requirements)

	wrathRules := GruulsLairFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.Equal(t, &rankings.LevelRangeRequirement{
		MinLevel: 0,
		MaxLevel: 70,
	}, wrathRules.Speedrun.LevelRange)
}
