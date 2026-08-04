package companion

import (
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
)

var testTS = time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

func newTestParser() *Parser {
	return New(slog.Default())
}

// --- Framing tests ---

func TestFeed_SingleSlotMessage(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[3Z:Dalaran,none,0,,0,0,0,571,0,]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	z, ok := msgs[0].(*messages.Zone)
	require.True(t, ok, "expected *messages.Zone, got %T", msgs[0])
	assert.Equal(t, "dalaran", z.Name)
	assert.Equal(t, uint32(571), z.MapID)
	assert.Equal(t, "none", z.InstanceType)
	assert.False(t, z.IsInstance)
}

func TestFeed_MultiSlotMessage(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	// First slot: starts the message, no closing ']'.
	msgs, err := p.Feed(testTS, `[4P0x060000000008DCCC;G1.51396.3820.41398.40014.0.0.0.264:2.50633.0.0.0.0.0.0`)
	require.NoError(t, err)
	assert.Empty(t, msgs, "should not produce messages yet")

	// Second slot: continuation with closing ']'.
	msgs, err = p.Feed(testTS, `~.245:5.51398.3832.41398.40051.0.0.0.264]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	c, ok := msgs[0].(*messages.Combatant)
	require.True(t, ok, "expected *messages.Combatant, got %T", msgs[0])
	// Should have 19 gear slots with items at correct positions (1-indexed → 0-indexed).
	require.Len(t, c.GearSetups, 19)
	assert.Equal(t, 51396, c.GearSetups[0].ItemID) // slot 1 = Head
	assert.Equal(t, 50633, c.GearSetups[1].ItemID) // slot 2 = Neck
	assert.Equal(t, 0, c.GearSetups[2].ItemID)     // slot 3 = Shoulder (empty)
	assert.Equal(t, 0, c.GearSetups[3].ItemID)     // slot 4 = Shirt (empty)
	assert.Equal(t, 51398, c.GearSetups[4].ItemID) // slot 5 = Chest
}

func TestFeed_BinPackedMessages(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	// Three messages packed in one field.
	field := `[4P0x060000000008DCCC;IArthas,DEATHKNIGHT,HUMAN,2,80][5P0x060000000008DCCC;UMy Guild][6H:0.1,Icecrown,enUS,3.3.5a,12340,a8f3]`
	msgs, err := p.Feed(testTS, field)
	require.NoError(t, err)
	require.Len(t, msgs, 4) // Identity → Combatant, Guild → Combatant, Header → Realm + Versions

	// First: Combatant from Identity
	c1, ok := msgs[0].(*messages.Combatant)
	require.True(t, ok, "msg[0] should be Combatant, got %T", msgs[0])
	assert.Equal(t, "Arthas", c1.Name)

	// Second: Combatant from Guild update (same player)
	c2, ok := msgs[1].(*messages.Combatant)
	require.True(t, ok, "msg[1] should be Combatant, got %T", msgs[1])
	require.NotNil(t, c2.Guild)
	assert.Equal(t, "My Guild", c2.Guild.Name)

	// Third: Realm from Header
	r, ok := msgs[2].(*messages.Realm)
	require.True(t, ok, "msg[2] should be Realm, got %T", msgs[2])
	assert.Equal(t, "Icecrown", r.RealmName)

	// Fourth: Versions from Header
	v, ok := msgs[3].(*messages.Versions)
	require.True(t, ok, "msg[3] should be Versions, got %T", msgs[3])
	assert.Equal(t, "0.1", v.Versions["chronicle_companion_wotlk"])
}

func TestFeed_DropDetection(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	// Start a message but don't close it.
	msgs, err := p.Feed(testTS, `[1Z:Icecrown Citadel,raid,2,25 Player`)
	require.NoError(t, err)
	assert.Empty(t, msgs)

	// Start a new message before closing the previous one — should discard.
	msgs, err = p.Feed(testTS, `[2Z:Dalaran,none,0,,0,0,0,571,0,]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	z, ok := msgs[0].(*messages.Zone)
	require.True(t, ok)
	assert.Equal(t, "dalaran", z.Name) // Second message, not the incomplete first.
}

func TestFeed_OrphanContinuation(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	// Continuation without a preceding start — should be ignored.
	msgs, err := p.Feed(testTS, `~.245:5.51398.3832.41398.40051.0.0.0.264]`)
	require.NoError(t, err)
	assert.Empty(t, msgs)
}

func TestIsCompanionMessage(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input    string
		expected bool
	}{
		{`[3Z:Dalaran]`, true},
		{`[0H:0.1]`, true},
		{`~continuation`, true},
		{`Another ability is not ready yet`, false},
		{``, false},
		{`[`, false},
		{`[X`, false},
	}

	for _, tc := range tests {
		assert.Equal(t, tc.expected, IsCompanionMessage(tc.input), "input: %q", tc.input)
	}
}

// --- Zone tests ---

func TestParseZone_ICC(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[1Z:Icecrown Citadel,raid,2,25 Player,25,1,1,631,0,The Frozen Throne]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	z, ok := msgs[0].(*messages.Zone)
	require.True(t, ok)
	assert.Equal(t, "icecrown citadel", z.Name)
	assert.Equal(t, "raid", z.InstanceType)
	assert.Equal(t, uint32(631), z.MapID)
	assert.True(t, z.IsInstance)
	assert.Equal(t, 2, z.DifficultyIndex)
	assert.Equal(t, "25 Player", z.DifficultyName)
	assert.Equal(t, 25, z.MaxPlayers)
	assert.Equal(t, 1, z.DynamicDifficulty)
	assert.Equal(t, "The Frozen Throne", z.SubZone)
}

func TestParseZone_OnyxiaVariants(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		input          string
		difficultyName string
		maxPlayers     int
	}{
		{
			name:  "classic",
			input: `[1Z:Onyxia's Lair,raid,3,,0,0,0,0,0,]`,
		},
		{
			name:           "wrath 25 player",
			input:          `[1Z:Onyxia's Lair,raid,2,25 Player,25,0,0,0,0,]`,
			difficultyName: "25 Player",
			maxPlayers:     25,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			msgs, err := newTestParser().Feed(testTS, tt.input)
			require.NoError(t, err)
			require.Len(t, msgs, 1)

			z, ok := msgs[0].(*messages.Zone)
			require.True(t, ok)
			assert.Equal(t, "onyxia's lair", z.Name)
			assert.Equal(t, "raid", z.InstanceType)
			assert.Equal(t, tt.difficultyName, z.DifficultyName)
			assert.Equal(t, tt.maxPlayers, z.MaxPlayers)
		})
	}
}

func TestParseZone_City(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[2Z:Dalaran,none,0,,0,0,0,571,0,The Violet Citadel]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	z := msgs[0].(*messages.Zone)
	assert.Equal(t, "dalaran", z.Name)
	assert.Equal(t, "none", z.InstanceType)
	assert.False(t, z.IsInstance)
	assert.Equal(t, uint32(571), z.MapID)
}

// --- Header tests ---

func TestParseHeader(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[0H:0.1,Icecrown,enUS,3.3.5a,12340,a8f3]`)
	require.NoError(t, err)
	require.Len(t, msgs, 2)

	r, ok := msgs[0].(*messages.Realm)
	require.True(t, ok)
	assert.Equal(t, "Icecrown", r.RealmName)
	assert.Equal(t, "3.3.5a", r.Version)
	assert.Equal(t, 12340, r.Build)

	v, ok := msgs[1].(*messages.Versions)
	require.True(t, ok)
	assert.Equal(t, "0.1", v.Versions["chronicle_companion_wotlk"])
	assert.Equal(t, "3.3.5a", v.Versions["wow"])
}

// --- Loot tests ---

func TestParseLoot_Drop(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[1LL,4,49623,1,Arthas]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	l, ok := msgs[0].(*messages.Loot)
	require.True(t, ok)
	assert.Equal(t, "Arthas", l.PlayerName)
	assert.Equal(t, int32(49623), l.ItemID)
	assert.Equal(t, int32(1), l.Quantity)
}

func TestParseLoot_Trade(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[2LT,4,49623,1,Arthas>Doydz]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	lt, ok := msgs[0].(*messages.LootTrade)
	require.True(t, ok)
	assert.Equal(t, "Arthas", lt.FromPlayerName)
	assert.Equal(t, "Doydz", lt.ToPlayerName)
	assert.Equal(t, int32(49623), lt.ItemID)
}

func TestParseLoot_Legendary(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[3LL,5,32837,1,Rhyd]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	l := msgs[0].(*messages.Loot)
	assert.Equal(t, int32(32837), l.ItemID)
	assert.Equal(t, int32(1), l.Quantity)
}

// --- Player Identity tests ---

func TestParsePlayer_Identity(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[4P0x060000000008DCCC;IArthas,DEATHKNIGHT,HUMAN,2,80]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	c, ok := msgs[0].(*messages.Combatant)
	require.True(t, ok)
	assert.Equal(t, "Arthas", c.Name)
	assert.Equal(t, "DEATHKNIGHT", string(c.HeroClass))
	assert.Equal(t, "Human", string(c.Race))
}

// --- Player Gear tests ---

func TestParsePlayer_Gear(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[5P0x060000000008DCCC;G1.51396.3820.41398.40014.0.0.0.264:2.50633.0.0.0.0.0.0.245]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	c := msgs[0].(*messages.Combatant)
	require.Len(t, c.GearSetups, 19)

	// Slot 1 = Head (index 0)
	g0 := c.GearSetups[0]
	assert.Equal(t, 51396, g0.ItemID)
	require.NotNil(t, g0.EnchantID)
	assert.Equal(t, 3820, *g0.EnchantID)
	assert.Equal(t, [4]int{41398, 40014, 0, 0}, g0.Gems)
	assert.Equal(t, 264, g0.ItemLevel)

	// Slot 2 = Neck (index 1)
	g1 := c.GearSetups[1]
	assert.Equal(t, 50633, g1.ItemID)
	assert.Nil(t, g1.EnchantID)
	assert.Equal(t, 245, g1.ItemLevel)

	// Remaining slots should be empty (zero-value GearItem)
	for i := 2; i < 19; i++ {
		assert.Equal(t, 0, c.GearSetups[i].ItemID, "slot %d should be empty", i+1)
	}
}

// --- Player Talents tests ---

func TestParsePlayer_Talents(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	talents := "05032001050000000000000000000}32000000000000000000000000000}00000000000000000000000000000"
	msg := `[6P0x060000000008DCCC;T1,2,` + talents + `,00000000000000000000000000000}00000000000000000000000000000}00000000000000000000000000000]`

	msgs, err := p.Feed(testTS, msg)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	c := msgs[0].(*messages.Combatant)
	require.NotNil(t, c.Talents)
	// Tree 0 has "05032001050000000000000000000" — sum is 0+5+0+3+2+0+0+1+0+5 = 16
	assert.Equal(t, uint8(16), c.Talents.Summary[0])
	// Tree 1 has "32000000000000000000000000000" — sum is 3+2 = 5
	assert.Equal(t, uint8(5), c.Talents.Summary[1])
	// Tree 2 is all zeros
	assert.Equal(t, uint8(0), c.Talents.Summary[2])
}

func TestParsePlayer_TalentsDualSpecActiveGroup2(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	// Group 1 (inactive) has points in tree 0; group 2 (active) has points in tree 1.
	group1 := "50200000000000000000000000}005305101230213233115031051}5300202010000000000000000000"
	group2 := "50100000000000000000000000}005305100000000000000000000}5000032500033330531115301301"
	msg := `[6P0x0000000000000A3B;T2,2,` + group1 + `,` + group2 + `]`

	msgs, err := p.Feed(testTS, msg)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	c := msgs[0].(*messages.Combatant)
	require.NotNil(t, c.Talents)
	// Active group 2: "50100000000000000000000000" — sum is 5+1 = 6
	assert.Equal(t, uint8(6), c.Talents.Summary[0])
	// "005305100000000000000000000" — sum is 5+3+5+1 = 14
	assert.Equal(t, uint8(14), c.Talents.Summary[1])
	// "5000032500033330531115301301" — sum is 5+3+2+5+3+3+3+3+5+3+1+1+1+5+3+1+3+1 = 51
	assert.Equal(t, uint8(51), c.Talents.Summary[2])
}

func TestParsePlayer_TalentsSingleSpec(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	talents := "05032001050000000000000000000}32000000000000000000000000000}00000000000000000000000000000"
	msg := `[6P0x060000000008DCCC;T1,1,` + talents + `]`

	msgs, err := p.Feed(testTS, msg)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	c := msgs[0].(*messages.Combatant)
	require.NotNil(t, c.Talents)
	assert.Equal(t, uint8(16), c.Talents.Summary[0])
	assert.Equal(t, uint8(5), c.Talents.Summary[1])
	assert.Equal(t, uint8(0), c.Talents.Summary[2])
}

func TestParsePlayer_TalentsActiveGroupOutOfRange(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	talents := "05032001050000000000000000000}32000000000000000000000000000}00000000000000000000000000000"
	// activeGroup 2 but numGroups 1 — invalid. Feed logs and drops bad
	// messages, so we expect no messages rather than an error.
	msg := `[6P0x060000000008DCCC;T2,1,` + talents + `]`

	msgs, err := p.Feed(testTS, msg)
	require.NoError(t, err)
	require.Empty(t, msgs)
}

func TestParsePlayer_TalentsThreeSpecsActiveGroup3(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	// Stock WotLK caps at 2 talent groups, but some private servers allow
	// more. Each group here has distinct sums so we can verify the correct
	// (third) group was selected.
	group1 := "50200000000000000000000000}005305101230213233115031051}5300202010000000000000000000"
	group2 := "50100000000000000000000000}005305100000000000000000000}5000032500033330531115301301"
	group3 := "12300000000000000000000000}440000000000000000000000000}0000000000000000000000000000"
	msg := `[6P0x0000000000000A3B;T3,3,` + group1 + `,` + group2 + `,` + group3 + `]`

	msgs, err := p.Feed(testTS, msg)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	c := msgs[0].(*messages.Combatant)
	require.NotNil(t, c.Talents)
	// Active group 3: "12300000000000000000000000" — sum is 1+2+3 = 6
	assert.Equal(t, uint8(6), c.Talents.Summary[0])
	// "440000000000000000000000000" — sum is 4+4 = 8
	assert.Equal(t, uint8(8), c.Talents.Summary[1])
	// Tree 3 is all zeros
	assert.Equal(t, uint8(0), c.Talents.Summary[2])
}

// --- Player Glyphs tests ---

func TestParsePlayer_Glyphs(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[7P0x060000000008DCCC;Y1,55440.58388.54845.58095.57719.0:0.0.0.0.0.0]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	c := msgs[0].(*messages.Combatant)
	require.NotNil(t, c.Glyphs)
	assert.Equal(t, 1, c.Glyphs.ActiveGroup)
	require.Len(t, c.Glyphs.Groups, 2)

	// Group 1: 3 major, 3 minor
	g1 := c.Glyphs.Groups[0]
	assert.Equal(t, [3]int{55440, 58388, 54845}, g1.Major)
	assert.Equal(t, [3]int{58095, 57719, 0}, g1.Minor)

	// Group 2: all empty
	g2 := c.Glyphs.Groups[1]
	assert.Equal(t, [3]int{0, 0, 0}, g2.Major)
	assert.Equal(t, [3]int{0, 0, 0}, g2.Minor)
}

// --- Player Guild tests ---

func TestParsePlayer_Guild(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[8P0x060000000008DCCC;UMy Guild]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	c := msgs[0].(*messages.Combatant)
	require.NotNil(t, c.Guild)
	assert.Equal(t, "My Guild", c.Guild.Name)
}

// --- Player Pet tests ---

func TestParsePlayer_Pet(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[9P0x060000000008DCCC;ESpot,0x060000000012ABCD]`)
	require.NoError(t, err)
	require.Len(t, msgs, 2)

	c := msgs[1].(*messages.Combatant)
	assert.Equal(t, "Spot", c.PetName)
}

// --- Player data accumulation tests ---

func TestPlayerDataAccumulation(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	// First: Identity.
	msgs, err := p.Feed(testTS, `[1P0x060000000008DCCC;IArthas,DEATHKNIGHT,HUMAN,2,80]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)
	c := msgs[0].(*messages.Combatant)
	assert.Equal(t, "Arthas", c.Name)
	assert.Nil(t, c.Guild)

	// Second: Guild (should retain Identity data).
	msgs, err = p.Feed(testTS, `[2P0x060000000008DCCC;UKnights of the Ebon Blade]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)
	c = msgs[0].(*messages.Combatant)
	assert.Equal(t, "Arthas", c.Name) // Still has name from Identity.
	require.NotNil(t, c.Guild)
	assert.Equal(t, "Knights of the Ebon Blade", c.Guild.Name)
}

// --- Meta test ---

func TestParseMeta(t *testing.T) {
	t.Parallel()
	p := newTestParser()

	msgs, err := p.Feed(testTS, `[5M5,12,8,15,3,0,0,0,0,0,0]`)
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	stats, ok := msgs[0].(*messages.CompanionStats)
	require.True(t, ok, "expected *messages.CompanionStats, got %T", msgs[0])
	assert.Equal(t, 5, stats.Dirty)
	assert.Equal(t, [10]int{12, 8, 15, 3, 0, 0, 0, 0, 0, 0}, stats.Buckets)
}

// --- GearItem extension tests ---

func TestGearItem_NewFields(t *testing.T) {
	t.Parallel()

	item := combatant.GearItem{
		ItemID:    51396,
		SuffixID:  0,
		Gems:      [4]int{41398, 40014, 0, 0},
		ItemLevel: 264,
	}
	assert.Equal(t, 51396, item.ItemID)
	assert.Equal(t, [4]int{41398, 40014, 0, 0}, item.Gems)
	assert.Equal(t, 264, item.ItemLevel)
}

// --- Zone extension tests ---

func TestZone_DifficultyFields(t *testing.T) {
	t.Parallel()

	z := zone.Zone{
		Name:              "icecrown citadel",
		MapID:             631,
		InstanceType:      "raid",
		IsInstance:        true,
		DifficultyIndex:   2,
		DifficultyName:    "25 Player",
		MaxPlayers:        25,
		DynamicDifficulty: 1,
		SubZone:           "The Frozen Throne",
	}
	assert.Equal(t, 2, z.DifficultyIndex)
	assert.Equal(t, "25 Player", z.DifficultyName)
	assert.Equal(t, "The Frozen Throne", z.SubZone)
}
