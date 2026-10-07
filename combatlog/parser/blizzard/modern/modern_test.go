package modern

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var _ gamedb.GameDB = hermesProxyTestDB{}

type hermesProxyTestDB struct{}

func (hermesProxyTestDB) ResolveGear([]combatant.GearItem) {}
func (hermesProxyTestDB) Creature(int32) (*database.WorldCreatureTemplate, bool) {
	return nil, false
}
func (hermesProxyTestDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return &chrondbc.Spell{ID: id}, nil
}
func (hermesProxyTestDB) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	return nil, nil
}
func (hermesProxyTestDB) TalentTrees(context.Context, uuid.UUID) (*talents.TalentTreeData, error) {
	return nil, nil
}
func (hermesProxyTestDB) ExtraAttackSpell(context.Context, int32) (dbcmem.ExtraAttackSpell, bool) {
	return dbcmem.ExtraAttackSpell{}, false
}
func (hermesProxyTestDB) DurationModifiers(context.Context) (*chrondbc.DurationModifierSet, error) {
	return &chrondbc.DurationModifierSet{}, nil
}
func (hermesProxyTestDB) PeriodicSpells(context.Context) (map[int32]dbcmem.PeriodicSpell, error) {
	return nil, nil
}

func TestReadBaseYearPreservesInput(t *testing.T) {
	t.Parallel()

	input := "\n9/3/2025 18:57:03.000-6  COMBAT_LOG_VERSION,9\n"
	reader, year, err := readBaseYear(strings.NewReader(input))
	require.NoError(t, err)
	assert.Equal(t, 2025, year)
	preserved, err := io.ReadAll(reader)
	require.NoError(t, err)
	assert.Equal(t, input, string(preserved))
}

func TestGUIDNormalizer(t *testing.T) {
	t.Parallel()

	n := newGUIDNormalizer()
	player, err := n.normalize("Player-6065-037BA400")
	require.NoError(t, err)
	assert.Equal(t, "0x000017B1037BA400", player)

	creatureRaw := "Creature-0-6263-564-439599-15479-00001E1033"
	creature, err := n.normalize(creatureRaw)
	require.NoError(t, err)
	assert.Equal(t, fmt.Sprintf("0xF130003C77%06X", hash24(creatureRaw)), creature)

	petRaw := "Pet-0-6263-564-439599-19189-0200CFB18D"
	pet, err := n.normalize(petRaw)
	require.NoError(t, err)
	assert.Equal(t, fmt.Sprintf("0xF140004AF5%06X", hash24(petRaw)), pet)
}

func TestGUIDNormalizerRetainsCanonicalMappings(t *testing.T) {
	t.Parallel()

	n := newGUIDNormalizer()
	playerRaw := "Player-6065-037BA400"
	player, err := n.normalize(playerRaw)
	require.NoError(t, err)
	creatureRaw := "Creature-0-6783-0-16021-1512-0001303730"
	creature, err := n.normalize(creatureRaw)
	require.NoError(t, err)

	playerGUID, err := guid.FromString(player)
	require.NoError(t, err)
	creatureGUID, err := guid.FromString(creature)
	require.NoError(t, err)
	assert.Equal(t, []GUIDMapping{
		{Canonical: creatureRaw, Compatibility: creatureGUID},
		{Canonical: playerRaw, Compatibility: playerGUID},
	}, n.mappings())
}

func TestGUIDNormalizerUsesCompleteWorldGUID(t *testing.T) {
	t.Parallel()

	n := newGUIDNormalizer()
	first, err := n.normalize("Creature-0-1-564-1-15479-01001E1033")
	require.NoError(t, err)
	second, err := n.normalize("Creature-0-1-564-1-15479-02001E1033")
	require.NoError(t, err)
	assert.NotEqual(t, first, second)
}

func TestGUIDNormalizerResolvesWorldGUIDCollision(t *testing.T) {
	t.Parallel()

	n := newGUIDNormalizer()
	raw := "Creature-0-1-564-1-15479-01001E1033"
	prefix := legacyCreatureHigh<<48 | uint64(15479)<<24
	initial := prefix | uint64(hash24(raw))
	n.valueToRaw[initial] = "Creature-0-1-564-1-15479-0000000001"

	normalized, err := n.normalize(raw)
	require.NoError(t, err)
	expected := prefix | uint64((hash24(raw)+1)&0xFFFFFF)
	assert.Equal(t, fmt.Sprintf("0x%016X", expected), normalized)
	assert.Equal(t, raw, n.valueToRaw[expected])
	assert.Equal(t, expected, n.rawToValue[raw])

	again, err := n.normalize(raw)
	require.NoError(t, err)
	assert.Equal(t, normalized, again, "repeated GUIDs must keep their allocated identity")
}

func TestGUIDNormalizerPlayerGUIDsAreLossless(t *testing.T) {
	t.Parallel()

	n := newGUIDNormalizer()
	first, err := n.normalize("Player-6065-037BA400")
	require.NoError(t, err)
	second, err := n.normalize("Player-6066-037BA400")
	require.NoError(t, err)
	third, err := n.normalize("Player-6065-037BA401")
	require.NoError(t, err)

	assert.Equal(t, "0x000017B1037BA400", first)
	assert.Equal(t, "0x000017B2037BA400", second)
	assert.Equal(t, "0x000017B1037BA401", third)
	assert.NotEqual(t, first, second)
	assert.NotEqual(t, first, third)
}

func TestCombatLogVersionSetsParserVersion(t *testing.T) {
	t.Parallel()

	ts, _, matched, err := wotlk.ParseLine(`9/20 20:02:05.988  BLIZZARD_COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1`)
	require.NoError(t, err)

	p := &Parser{}
	_, err = p.combatLogVersion(ts, matched, "")
	require.NoError(t, err)
	assert.Equal(t, 22, p.version)
}

func TestTransformV22Damage(t *testing.T) {
	t.Parallel()

	r := newTransformReader(strings.NewReader(""))
	_, err := r.transform(`9/20/2026 15:02:05.988-5  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0,BUILD_VERSION,1.60.1,PROJECT_ID,18`)
	require.NoError(t, err)

	line := `9/20/2026 15:02:08.135-5  SPELL_DAMAGE,Player-4618-00C7EC79,"Tester-ClassicBetaPvE-",0x518,0x80000000,Creature-0-6783-0-16021-1512-0000B03B52,"Duskbat",0xa28,0x80000000,686,"Shadow Bolt",0x20,Creature-0-6783-0-16021-1512-0000B03B52,0000000000000000,18,42,3,0,20,0,0,0,1,0,0,0,1751.67,1697.84,1420,4.4674,1,15,15,-1,32,0,0,0,nil,nil,nil,ST`
	converted, err := r.transform(line)
	require.NoError(t, err)
	assert.Contains(t, converted, `"Tester"`)
	assert.Contains(t, converted, `686,"Shadow Bolt",0x20,15,-1,32,0,0,0,nil,nil,nil`)
}

func TestTransformV22UnitDissipates(t *testing.T) {
	t.Parallel()

	r := newTransformReader(strings.NewReader(""))
	_, err := r.transform(`9/20/2026 15:02:05.988-5  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0,BUILD_VERSION,1.60.1,PROJECT_ID,18`)
	require.NoError(t, err)

	converted, err := r.transform(`9/20/2026 15:02:08.135-5  UNIT_DISSIPATES,0000000000000000,nil,0x80000000,0x80000000,Creature-0-6783-0-16021-1512-0000B03B52,"Duskbat",0xa28,0x80000000,0,-1`)
	require.NoError(t, err)
	assert.Contains(t, converted, `UNIT_DISSIPATES,0x0000000000000000,nil,0x80000000,`)
	assert.Contains(t, converted, `,"Duskbat",0xa28,0,-1`)
}

func TestTransformV22EmitsUnitTelemetry(t *testing.T) {
	t.Parallel()

	r := newTransformReader(strings.NewReader(""))
	_, err := r.transform(`9/20/2026 15:02:05.988-5  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18`)
	require.NoError(t, err)

	line := `9/20/2026 15:02:08.135-5  SPELL_DAMAGE,Player-4618-00C7EC79,"Tester-ClassicBetaPvE-",0x518,0x80000000,Creature-0-6783-0-16021-1512-0000B03B52,"Duskbat",0xa28,0x80000000,686,"Shadow Bolt",0x20,Creature-0-6783-0-16021-1512-0000B03B52,0000000000000000,18,42,3,4,20,5,0,0,0,20,40,0,1751.67,1697.84,1420,4.4674,1,15,15,-1,32,0,0,0,nil,nil,nil,ST`
	converted, err := r.transform(line)
	require.NoError(t, err)
	lines := strings.Split(converted, "\n")
	require.Len(t, lines, 3)
	timestamp := strings.SplitN(lines[0], "  ", 2)[0]
	assert.Equal(t, timestamp, strings.SplitN(lines[1], "  ", 2)[0])
	assert.Equal(t, timestamp, strings.SplitN(lines[2], "  ", 2)[0])
	assert.Contains(t, lines[0], `SPELL_DAMAGE`)
	assert.Contains(t, lines[1], `BLIZZARD_UNIT_POSITION,`)
	assert.Contains(t, lines[1], `,1751.67,1697.84,1420,4.4674`)
	assert.Contains(t, lines[2], `BLIZZARD_UNIT_RESOURCES,`)
	assert.Contains(t, lines[2], `,18,42,5,0,20,40,3,4,20`)
}

func TestTransformV22SwingDamageLandedKeepsUnitTelemetry(t *testing.T) {
	t.Parallel()

	r := newTransformReader(strings.NewReader(""))
	_, err := r.transform(`9/20/2026 15:02:05.988-5  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18`)
	require.NoError(t, err)

	line := `9/20/2026 15:02:08.135-5  SWING_DAMAGE_LANDED,Player-4618-00C7EC79,"Tester-ClassicBetaPvE-",0x518,0x80000000,Creature-0-6783-0-16021-1512-0000B03B52,"Duskbat",0xa28,0x80000000,Creature-0-6783-0-16021-1512-0000B03B52,0000000000000000,18,42,3,4,20,5,0,0,0,20,40,0,1751.67,1697.84,1420,4.4674,1,15,15,-1,32,0,0,0,nil,nil,nil,ST`
	converted, err := r.transform(line)
	require.NoError(t, err)
	lines := strings.Split(converted, "\n")
	require.Len(t, lines, 2)
	assert.Contains(t, lines[0], `BLIZZARD_UNIT_POSITION,`)
	assert.Contains(t, lines[1], `BLIZZARD_UNIT_RESOURCES,`)
}

func TestParseV22UnitTelemetry(t *testing.T) {
	t.Parallel()

	input, err := os.ReadFile("testdata/wow_forever_v22_advanced.log")
	require.NoError(t, err)
	p, err := New(context.Background(), slog.Default(), strings.NewReader(string(input)), hermesProxyTestDB{}, hermesProxyTestDB{}, nil)
	require.NoError(t, err)

	var position *messages.UnitPosition
	var resources *messages.UnitResources
	positionUnits := make(map[guid.GUID]int)
	resourceUnits := make(map[guid.GUID]int)
	for {
		batch, advanceErr := p.Advance(context.Background())
		for _, msg := range batch {
			switch typed := msg.(type) {
			case *messages.UnitPosition:
				position = typed
				positionUnits[typed.Unit]++
			case *messages.UnitResources:
				resources = typed
				resourceUnits[typed.Unit]++
			}
		}
		if advanceErr == io.EOF {
			break
		}
		require.NoError(t, advanceErr)
	}

	require.Len(t, positionUnits, 2, "source-side cast and target-side landed events must use infoGUID")
	require.Len(t, resourceUnits, 2, "source-side cast and target-side landed events must use infoGUID")
	var positionCount, resourceCount int
	for _, count := range positionUnits {
		positionCount += count
	}
	for _, count := range resourceUnits {
		resourceCount += count
	}
	require.Equal(t, 3, positionCount, "parser must preserve snapshots for encounter-scoped deduplication")
	require.Equal(t, 3, resourceCount, "parser must preserve snapshots for encounter-scoped deduplication")
	require.NotNil(t, position)
	assert.Equal(t, 1751.67, position.X)
	assert.Equal(t, 1697.84, position.Y)
	assert.Equal(t, int32(1420), position.MapID)
	assert.Equal(t, 4.4674, position.Facing)
	require.NotNil(t, resources)
	assert.Equal(t, int64(18), resources.CurrentHealth)
	assert.Equal(t, int64(42), resources.MaximumHealth)
	assert.Equal(t, int32(5), resources.Absorb)
	assert.Equal(t, types.ResourceMana, resources.PowerType)
	assert.Equal(t, int32(20), resources.CurrentPower)
	assert.Equal(t, int32(40), resources.MaximumPower)
	assert.Equal(t, int32(3), resources.AttackPower)
	assert.Equal(t, int32(4), resources.SpellPower)
	assert.Equal(t, int32(20), resources.Armor)
	assert.Equal(t, position.Unit, resources.Unit)
}

func TestParseV22CompoundResourceSnapshotUsesPrimaryResource(t *testing.T) {
	t.Parallel()

	input, err := os.ReadFile("testdata/wow_forever_v22_compound_resources.log")
	require.NoError(t, err)
	p, err := New(context.Background(), slog.Default(), strings.NewReader(string(input)), hermesProxyTestDB{}, hermesProxyTestDB{}, nil)
	require.NoError(t, err)

	var resources *messages.UnitResources
	for {
		batch, advanceErr := p.Advance(context.Background())
		for _, msg := range batch {
			if typed, ok := msg.(*messages.UnitResources); ok {
				resources = typed
			}
		}
		if advanceErr == io.EOF {
			break
		}
		require.NoError(t, advanceErr)
	}

	require.NotNil(t, resources)
	assert.Equal(t, types.ResourceRage, resources.PowerType)
	assert.Equal(t, int32(345), resources.CurrentPower)
	assert.Equal(t, int32(1000), resources.MaximumPower)
}

func TestTransformV22HealUsesTotalAmount(t *testing.T) {
	t.Parallel()

	r := newTransformReader(strings.NewReader(""))
	_, err := r.transform(`9/20/2026 15:02:05.988-5  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18`)
	require.NoError(t, err)

	line := `9/20/2026 15:02:14.039-5  SPELL_HEAL,Player-4620-00C80D47,"Healer-ClassicBetaPvE2-",0x518,0x80000000,Player-4620-00C80D47,"Healer-ClassicBetaPvE2-",0x518,0x80000000,2050,"Lesser Heal",0x2,Player-4620-00C80D47,0000000000000000,62,62,22,0,43,0,0,0,0,130,130,0,1696.47,1669.13,1420,5.8493,0,40,52,12,0,nil`
	converted, err := r.transform(line)
	require.NoError(t, err)
	assert.Contains(t, converted, `2050,"Lesser Heal",0x2,52,12,0,nil`)
}

func TestTransformDamage(t *testing.T) {
	t.Parallel()

	line := `9/3/2026 18:57:03.000-6  SPELL_DAMAGE,Player-6065-049DF19A,"Toptier-Nightslayer-US",0x514,0x80000000,Creature-0-6263-564-204635-22875-00021A0E65,"Coilskar Sea-Caller",0xa48,0x80000040,27157,"Judgement of Righteousness",0x2,Creature-0-6263-564-204635-22875-00021A0E65,0000000000000000,170803,172320,0,0,0,0,0,-1,0,0,0,230.18,946.42,339,3.0830,71,1012,1012,-1,2,0,0,0,nil,nil,nil,ST`
	r := newTransformReader(strings.NewReader(line))
	converted, err := r.transform(line)
	require.NoError(t, err)
	targetRaw := "Creature-0-6263-564-204635-22875-00021A0E65"
	expectedTarget := fmt.Sprintf("0xF13000595B%06X", hash24(targetRaw))
	assert.Equal(t, `9/4 00:57:03.000  SPELL_DAMAGE,0x000017B1049DF19A,"Toptier-Nightslayer-US",0x514,`+expectedTarget+`,"Coilskar Sea-Caller",0xa48,27157,"Judgement of Righteousness",0x2,1012,-1,2,0,0,0,nil,nil,nil`, converted)
}

func TestTransformDamageShield(t *testing.T) {
	t.Parallel()

	line := `9/6/2026 19:17:33.739-6  DAMAGE_SHIELD,Player-6065-047EBC96,"Aeliz-Nightslayer-US",0x40514,0x80000000,Creature-0-6263-564-439599-22952-00001E05CE,"Veras Darkshadow",0xa48,0x80000040,26992,"Thorns",0x8,Creature-0-6263-564-439599-22952-00001E05CE,0000000000000000,1742798,1746500,0,0,0,0,0,-1,0,0,0,679.25,313.82,339,3.5511,73,46,46,-1,8,0,0,0,nil,nil,nil,ST`
	converted, err := newTransformReader(strings.NewReader(line)).transform(line)
	require.NoError(t, err)
	assert.Contains(t, converted, `26992,"Thorns",0x8,46,-1,8,0,0,0,nil,nil,nil`)
}

func TestTransformAbsorbedVariants(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		version  int
		line     string
		expected string
	}{
		{9, `9/3/2026 18:58:00.398-6  SPELL_ABSORBED,Creature-0-6263-564-204635-22878-00019A0E65,"Aqueous Lord",0x10a48,0x80000080,Player-6065-03CAC527,"Rewben-Nightslayer-US",0x40511,0x80000000,Player-6065-0432F380,"Robzumbie-Nightslayer-US",0x514,0x80000000,25218,"Power Word: Shield",0x2,2140,6661`, `25218,"Power Word: Shield",0x2,2140`},
		{9, `9/3/2026 18:58:06.299-6  SPELL_ABSORBED,Creature-0-6263-564-204635-22875-00021A0E65,"Coilskar Sea-Caller",0xa48,0x80000040,Player-6065-048F48CE,"Bradleyzeal-Nightslayer-US",0x514,0x80000000,40090,"Hurricane",0x8,Player-6065-0432F380,"Robzumbie-Nightslayer-US",0x514,0x80000000,25218,"Power Word: Shield",0x2,1852,1852`, `25218,"Power Word: Shield",0x2,1852`},
		{22, `9/23/2026 11:12:20.602-4  SPELL_ABSORBED,Creature-0-4615-0-10340-267006-0000B3EC43,"Dark Neophyte",0xa28,0x80000000,Player-4620-00D5496D,"Brother-ClassicBetaPvE2-",0x518,0x80000000,9613,"Shadow Bolt",0x20,Player-4620-00D5496D,"Brother-ClassicBetaPvE2-",0x518,0x80000000,1310927,"Light's Fury",0x2,4,38,nil`, `1310927,"Light's Fury",0x2,4`},
		{22, `9/23/2026 11:12:27.557-4  SPELL_ABSORBED,Creature-0-4615-0-10340-267006-0000B3EC43,"Dark Neophyte",0xa28,0x80000000,Player-4620-00D5496D,"Brother-ClassicBetaPvE2-",0x518,0x80000000,Player-4620-00D5496D,"Brother-ClassicBetaPvE2-",0x518,0x80000000,1310927,"Light's Fury",0x2,4,16,nil`, `1310927,"Light's Fury",0x2,4`},
	} {
		r := newTransformReader(strings.NewReader(tc.line))
		r.combatLogVersion = tc.version
		converted, err := r.transform(tc.line)
		require.NoError(t, err)
		assert.Contains(t, converted, "BLIZZARD_SPELL_ABSORBED")
		assert.Contains(t, converted, tc.expected)
	}
}

func TestDominantEngagedRealm(t *testing.T) {
	t.Parallel()

	base := `9/3/2026 18:57:03.000-6  %s`
	log := strings.Join([]string{
		fmt.Sprintf(base, `SPELL_CAST_SUCCESS,Player-1-00000001,"Visitor-Dreamscythe-US",0x514,0,0000000000000000,nil,0,0,1,"Spell",0x1`),
		fmt.Sprintf(base, `ENCOUNTER_START,601,"Boss",4,25,564,5`),
		fmt.Sprintf(base, `SPELL_DAMAGE,Player-2-00000001,"One-Nightslayer-US",0x514,0,Creature-0-1-564-1-1-1,"Boss",0,0,1,"Spell",0x1,1,1,-1,1,0,0,0,nil,nil,nil`),
		fmt.Sprintf(base, `SPELL_HEAL,Player-2-00000002,"Two-Nightslayer-US",0x514,0,Player-2-00000001,"One-Nightslayer-US",0x514,0,1,"Heal",0x2,1,1,0,0,nil`),
		fmt.Sprintf(base, `ENCOUNTER_END,601,"Boss",4,25,1`),
	}, "\n")
	assert.Equal(t, "Nightslayer-US", DominantEngagedRealm([]byte(log)))
}

func TestDominantEngagedRealmV22TrailingRegionSeparator(t *testing.T) {
	t.Parallel()

	log := strings.Join([]string{
		`9/20/2026 15:02:05.988-5  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0,BUILD_VERSION,1.60.1,PROJECT_ID,18`,
		`9/20/2026 15:02:08.135-5  SPELL_DAMAGE,Player-4618-00C7EC79,"Tester-ClassicBetaPvE-",0x518,0x80000000,Creature-0-6783-0-16021-1512-0000B03B52,"Duskbat",0xa28,0x80000000,686,"Shadow Bolt",0x20,15,-1,32,0,0,0,nil,nil,nil`,
	}, "\n")
	assert.Equal(t, "ClassicBetaPvE", DominantEngagedRealm([]byte(log)))
}

func TestParseCombatantMetadata(t *testing.T) {
	t.Parallel()

	talents, err := parseTalentSummary("(8,0,53)")
	require.NoError(t, err)
	assert.Equal(t, [3]uint8{8, 0, 53}, talents.Summary)

	gear := parseGear(`[(29028,120,(3009,0,0),(),(25897,70,24057,70)),(0,0,(),(),())]`)
	require.Len(t, gear, 2)
	assert.Equal(t, 29028, gear[0].ItemID)
	assert.Equal(t, 120, gear[0].ItemLevel)
	require.NotNil(t, gear[0].EnchantID)
	assert.Equal(t, 3009, *gear[0].EnchantID)
	assert.Zero(t, gear[1].ItemID)
}

func TestCombatantInfoV22ResolvesClassTalentsAndGear(t *testing.T) {
	t.Parallel()

	fields := make([]string, 33)
	// Real selections from Bootie's WoW Forever Wailing Caverns log.
	fields[25] = "[(105924,130654,5),(105923,130653,5)]"
	fields[26] = "(0,0,0,0)"
	fields[27] = "[(253955,25,(),(),()),(251534,24,(2623,0,0),(),())]"
	encoded := base64.RawStdEncoding.EncodeToString([]byte(strings.Join(fields, ",")))
	ts, _, matched, err := wotlk.ParseLine(`9/23 15:26:53.574  BLIZZARD_COMBATANT_INFO,0x0000120A0062CD4D,"Bootie-ClassicBetaPvE",` + encoded)
	require.NoError(t, err)

	treeData := &talents.TalentTreeData{Classes: map[int32]talents.ClassTalentData{
		9: {Tabs: []talents.TalentTabData{
			{OrderIndex: 0, Name: "Affliction", Talents: []talents.TalentEntry{
				{ID: 105924, TraitNodeEntryIDs: []int32{130654}, MaxRank: 5, TabIndex: 0},
				{ID: 105923, TraitNodeEntryIDs: []int32{130653}, MaxRank: 5, TabIndex: 1},
			}},
			{OrderIndex: 1, Name: "Demonology"},
			{OrderIndex: 2, Name: "Destruction"},
		}},
	}}
	parsed, err := (&Parser{version: 22, talentTrees: treeData}).combatantInfo(ts, matched, "")
	require.NoError(t, err)
	require.Len(t, parsed, 1)
	combatantInfo := parsed[0].(*messages.Combatant)
	assert.Equal(t, "Bootie", combatantInfo.Name)
	assert.Equal(t, types.HeroClassesWARLOCK, combatantInfo.HeroClass)
	require.NotNil(t, combatantInfo.Talents)
	assert.Equal(t, [3]uint8{10, 0, 0}, combatantInfo.Talents.Summary)
	assert.Equal(t, []uint8{5, 5}, combatantInfo.Talents.Trees[0])
	assert.Equal(t, [3]string{"Affliction", "Demonology", "Destruction"}, combatantInfo.Talents.TabNames)
	require.Len(t, combatantInfo.GearSetups, 2)
	assert.Equal(t, 253955, combatantInfo.GearSetups[0].ItemID)
	assert.Equal(t, 25, combatantInfo.GearSetups[0].ItemLevel)
	require.NotNil(t, combatantInfo.GearSetups[1].EnchantID)
	assert.Equal(t, 2623, *combatantInfo.GearSetups[1].EnchantID)
}

func TestCombatantInfoLeavesUnknownLevelUnset(t *testing.T) {
	t.Parallel()

	fields := make([]string, 27)
	fields[24] = "(8,0,53)"
	fields[26] = "[]"
	encoded := base64.RawStdEncoding.EncodeToString([]byte(strings.Join(fields, ",")))
	ts, _, matched, err := wotlk.ParseLine(`9/8 12:00:00.000  BLIZZARD_COMBATANT_INFO,0x000017B1037BA400,"Player-Nightslayer-US",` + encoded)
	require.NoError(t, err)

	parsed, err := (&Parser{version: 9}).combatantInfo(ts, matched, "")
	require.NoError(t, err)
	require.Len(t, parsed, 1)
	combatant, ok := parsed[0].(*messages.Combatant)
	require.True(t, ok)
	assert.Equal(t, "Player", combatant.Name)
	require.Nil(t, combatant.Level)
}

func TestTransformHermesProxyTrimsPlayerNameSuffixes(t *testing.T) {
	t.Parallel()

	line := `9/9 22:35:51.725  PARTY_KILL,Player-1-0000C4A1,"Curtuvas-",0x512,0x0,Player-1-00006F26,"Jeb-",0x528,0x0`
	converted, err := newHermesProxyTransformReader(strings.NewReader(line)).transform(line)
	require.NoError(t, err)
	assert.Equal(t, `9/9 22:35:51.725  PARTY_KILL,0x000000010000C4A1,"Curtuvas",0x512,0x0000000100006F26,"Jeb",0x528`, converted)
}

func TestTransformV9PreservesPlayerRealmSuffix(t *testing.T) {
	t.Parallel()

	line := `9/3/2026 18:57:03.000-6  PARTY_KILL,Player-6065-049DF19A,"Toptier-Nightslayer-US",0x514,0x0,Player-6065-03CAC527,"Rewben-Nightslayer-US",0x511,0x0`
	converted, err := newTransformReader(strings.NewReader(line)).transform(line)
	require.NoError(t, err)
	assert.Contains(t, converted, `"Toptier-Nightslayer-US"`)
	assert.Contains(t, converted, `"Rewben-Nightslayer-US"`)
}

func TestTransformHermesProxyAdvancedFields(t *testing.T) {
	t.Parallel()

	line := `9/9 22:36:06.095  SPELL_CAST_SUCCESS,Player-1-0000C4A1,"Curtuvas-",0x512,0x0,0000000000000000,nil,0x80000000,0x80000000,1787,"Stealth",0x1,Player-1-0000C4A1,0000000000000000,0,100,0,0,0,-1,0,0,0,79.10,-231.26,0,4.8183,0`
	converted, err := newHermesProxyTransformReader(strings.NewReader(line)).transform(line)
	require.NoError(t, err)
	assert.Equal(t, `9/9 22:36:06.095  SPELL_CAST_SUCCESS,0x000000010000C4A1,"Curtuvas",0x512,0x0000000000000000,nil,0x80000000,1787,"Stealth",0x1`, converted)
}

func TestTransformHermesProxyCastFailed(t *testing.T) {
	t.Parallel()

	line := `9/9 22:45:28.337  SPELL_CAST_FAILED,Player-1-00004AAF,"Brainfever-",0x511,0x0,0000000000000000,nil,0x80000000,0x80000000,23246,"Purple Skeletal Warhorse",0x1,"[1H:0.8,Kronos V,enUS,1.14.2,42597,da29,1788986746,120][2PPlayer-1-00004AAF;T1,1,230255]"`
	converted, err := newHermesProxyTransformReader(strings.NewReader(line)).transform(line)
	require.NoError(t, err)
	assert.Equal(t, `9/9 22:45:28.337  SPELL_CAST_FAILED,0x0000000100004AAF,"Brainfever",0x511,0x0000000000000000,nil,0x80000000,23246,"Purple Skeletal Warhorse",0x1,"[1H:0.8,Kronos V,enUS,1.14.2,42597,da29,1788986746,120][2P0x0000000100004AAF;T1,1,230255]"`, converted)
}

func TestHermesProxyDamageAfterVersionLine(t *testing.T) {
	t.Parallel()

	input := strings.Join([]string{
		`10/3 16:47:41.712  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.14.2,PROJECT_ID,2`,
		`10/3 16:54:40.317  SPELL_DAMAGE,Player-1-00001ECE,"Veljanov-",0x512,0x0,Creature-0-1-0-0-10412-0000018B06,"Crypt Crawler",0xa48,0x0,23894,"Bloodthirst",0x1,0000000000000000,0000000000000000,0,0,0,0,0,-1,0,0,0,0.00,0.00,0,0.0000,0,775,775,-1,1,0,0,0,1,nil,nil`,
	}, "\n")
	p, err := NewHermesProxy(context.Background(), slog.Default(), strings.NewReader(input), hermesProxyTestDB{}, hermesProxyTestDB{}, nil)
	require.NoError(t, err)

	var amount int32 = -1
	for {
		batch, advanceErr := p.Advance(context.Background())
		for _, msg := range batch {
			if damage, ok := msg.(*messages.Damage); ok {
				amount = damage.Amount
			}
		}
		if advanceErr == io.EOF {
			break
		}
		require.NoError(t, advanceErr)
	}
	assert.Equal(t, int32(775), amount)
}

func TestHermesProxyParserDecodesCompanionHeader(t *testing.T) {
	t.Parallel()

	input := strings.Join([]string{
		`9/9 22:45:28.337  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.14.2,PROJECT_ID,2`,
		`9/9 22:45:28.337  SPELL_CAST_FAILED,Player-1-00004AAF,"Brainfever-",0x511,0x0,0000000000000000,nil,0x80000000,0x80000000,23246,"Purple Skeletal Warhorse",0x1,"[1H:0.8,Kronos V,enUS,1.14.2,42597,da29,1788986746,120]"`,
	}, "\n")

	p, err := NewHermesProxy(context.Background(), slog.Default(), strings.NewReader(input), hermesProxyTestDB{}, hermesProxyTestDB{}, nil)
	require.NoError(t, err)

	var parsed []messages.Message
	for {
		batch, advanceErr := p.Advance(context.Background())
		parsed = append(parsed, batch...)
		if advanceErr == io.EOF {
			break
		}
		require.NoError(t, advanceErr)
	}

	var foundRealm bool
	for _, msg := range parsed {
		realmMessage, ok := msg.(*messages.Realm)
		if !ok {
			continue
		}
		foundRealm = true
		assert.Equal(t, "Kronos V", realmMessage.RealmName)
		assert.Equal(t, "1.14.2", realmMessage.Version)
		assert.Equal(t, 42597, realmMessage.Build)
	}
	assert.True(t, foundRealm)

	convertedGUID, err := newGUIDNormalizer().normalize("Player-1-00004AAF")
	require.NoError(t, err)
	parsedGUID, err := guid.FromString(convertedGUID)
	require.NoError(t, err)
	assert.Equal(t, guid.GUID(0x0000000100004AAF), parsedGUID)
}

func TestTransformEncounterBoundaries(t *testing.T) {
	t.Parallel()

	reader := newTransformReader(strings.NewReader(""))
	start, err := reader.transform(`9/8/2026 12:00:00.000-6  ENCOUNTER_START,601,"Boss",4,25,564,5`)
	require.NoError(t, err)
	assert.Equal(t, `9/8 18:00:00.000  BLIZZARD_ENCOUNTER_START,601,"Boss",4,25,564,5`, start)
	ts, _, matched, err := wotlk.ParseLine(start)
	require.NoError(t, err)
	parsed, err := (&Parser{}).encounterStart(ts, matched, "")
	require.NoError(t, err)
	require.Len(t, parsed, 1)
	boundary, ok := parsed[0].(*messages.EncounterBoundary)
	require.True(t, ok)
	assert.Equal(t, uint32(564), boundary.InstanceID)

	end, err := reader.transform(`9/8/2026 12:05:00.000-6  ENCOUNTER_END,601,"Boss",4,25,1`)
	require.NoError(t, err)
	assert.Equal(t, `9/8 18:05:00.000  BLIZZARD_ENCOUNTER_END,601,"Boss",4,25,1`, end)
}
