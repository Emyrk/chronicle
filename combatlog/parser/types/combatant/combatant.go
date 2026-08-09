package combatant

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
)

type Transmog struct {
	Slot       int32
	ItemID     int32
	TransmogID int32
}

const (
	PrefixCombatant = `COMBATANT_INFO:`
)

func IsCombatant(content string) (string, bool) {
	return types.Is(PrefixCombatant, content)
}

// Combatant is the raw parsing. Additional logic should be build ontop
// to handle things like enums.
type Combatant struct {
	Name      string
	Guid      guid.GUID
	Seen      time.Time
	HeroClass types.HeroClasses
	Gender    types.HeroGender
	Race      types.HeroRaces
	PetName   string

	Guild      *Guild
	GearSetups []GearItem
	Talents    *Talents
	Glyphs     *Glyphs
	Level      *int32
}

func (c *Combatant) SafeMergeExisting(existing Combatant) {
	if c.Name == "" && existing.Name != "" {
		c.Name = existing.Name
	}
	if c.Name == "Unknown" && existing.Name != "Unknown" && existing.Name != "" {
		// Annoying, but another case to consider
		c.Name = existing.Name
	}
	if c.Level == nil {
		c.Level = existing.Level
	}
	if c.Guild == nil && existing.Guild != nil {
		c.Guild = existing.Guild
	}
	if c.HeroClass == types.HeroClassesUNKNOWN || c.HeroClass == "" {
		c.HeroClass = existing.HeroClass
	}
	if c.Gender == types.HeroGenderUnknown || c.Gender < 0 {
		c.Gender = existing.Gender
	}
	if c.Race == types.HeroRacesUnknown || c.Race == "" {
		c.Race = existing.Race
	}
}

func (c *Combatant) MergeExisting(existing Combatant) {
	c.SafeMergeExisting(existing)
	if c.GearSetups == nil && existing.GearSetups != nil {
		c.GearSetups = existing.GearSetups
	}
	if c.Talents == nil && existing.Talents != nil {
		c.Talents = existing.Talents
	}
	if c.Glyphs == nil && existing.Glyphs != nil {
		c.Glyphs = existing.Glyphs
	}
}

// Glyphs holds glyph spell IDs for one or two talent specs.
type Glyphs struct {
	ActiveGroup int          // 1 or 2 (which spec is active)
	Groups      []GlyphGroup // one per talent spec
}

// GlyphGroup contains the glyph spell IDs for a single talent spec.
type GlyphGroup struct {
	Major [3]int // Major glyph spell IDs (0 = empty)
	Minor [3]int // Minor glyph spell IDs (0 = empty)
}

func ParseCombatantInfo(ri *realmclock.Info, content string) (Combatant, error) {
	var empty Combatant

	nilToEmpty := func(s string) string {
		if s == "nil" {
			return ""
		}
		return s
	}

	trimmed, ok := IsCombatant(content)
	if !ok {
		return empty, fmt.Errorf("not a COMBATANT_INFO message")
	}

	info := splitInfo(trimmed)
	if len(info) <= 27 {
		return empty, fmt.Errorf("insufficient arguments in COMBATANT_INFO message, got %d, want at least 27", len(info))
	}

	ts, err := ri.ParseAddonDate(info.timestamp())
	if err != nil {
		return empty, fmt.Errorf("invalid timestamp format in COMBATANT_INFO message: %v", err)
	}

	hc, err := types.ParseHeroClasses(info.heroClassLocal())
	if err != nil {
		return empty, fmt.Errorf("invalid class: %w", err)
	}

	race, err := types.ParseHeroRaces(info.raceLocal())
	if err != nil {
		return empty, fmt.Errorf("invalid race: %w", err)
	}

	genderInt, err := strconv.ParseInt(info.genderLocal(), 10, 64)
	if err != nil {
		return empty, fmt.Errorf("invalid class: %w", err)
	}
	gender := types.HeroGender(genderInt)
	if !gender.IsValid() {
		return empty, fmt.Errorf("invalid gender: %s", info.genderLocal())
	}

	player := Combatant{
		Seen:       ts,
		Name:       info.name(),
		HeroClass:  hc,
		Gender:     gender,
		Race:       race,
		PetName:    nilToEmpty(info.petName()),
		Guild:      nil,
		GearSetups: nil,
		Talents:    nil,
	}

	if info.guildName() != "nil" {
		player.Guild = &Guild{
			Name:      info.guildName(),
			RankName:  info.guildRankName(),
			RankIndex: 0, // info.guildRankIndex(), // TODO
		}
	}

	// Parse gear (items 9-27, 19 slots)
	gear, hasGear := info.gear()
	if hasGear {
		player.GearSetups = ParseGear(gear)
	}

	//// Parse talents (item 28)
	//if len(messageArgs) > 28 && messageArgs[28] != "nil" && strings.Contains(messageArgs[28], "}") {
	//	talents := p.stripTalentSpecialization(messageArgs[28])
	//	participant.Talents = &talents
	//}

	tls, err := ParseTalents(info.talents())
	if err != nil {
		return empty, fmt.Errorf("invalid talents format in COMBATANT_INFO message: %v", err)
	}
	player.Talents = tls

	guidStr := info.guid()
	player.Guid, err = guid.FromString(guidStr)
	if err != nil {
		return empty, fmt.Errorf("invalid GUID format in COMBATANT_INFO message: %v", err)
	}

	return player, nil
}

func (c Combatant) HasGUID() bool {
	return !c.Guid.IsZero()
}

// Guild contains guild membership information
type Guild struct {
	Name     string
	RankName string
	// TODO: RankIndex should probably be an integer
	RankIndex int32
}

// GearItem represents an equipped item with optional enchant
type GearItem struct {
	Name          string
	ItemID        int
	EnchantID     *int
	TempEnchantID *int
	SuffixID      int
	TransmogID    *int
	GemEnchantIDs [4]int // Gem enchantment IDs from the item link (0 = empty socket)
	ItemLevel     int    // Item level from the item link
}

// ParseGear parses gear slot strings into GearItem slices.
// Each gear string is expected in format "itemID:enchantID" (e.g., "12345:678").
// Returns nil for empty input. Skips "nil" entries and malformed items.
func ParseGear(gear []string) []GearItem {
	if len(gear) == 0 {
		return nil
	}

	gearItems := make([]GearItem, 0, len(gear))
	for _, arg := range gear {
		if arg == "nil" {
			gearItems = append(gearItems, GearItem{}) // Append empty GearItem for "nil" slots
			continue
		}

		var name string
		nameSplit := strings.Split(arg, ";")
		if len(nameSplit) == 2 {
			name = nameSplit[0]
			arg = nameSplit[1] //itemID:enchantID part
		}

		itemArgs := strings.Split(arg, ":")
		if len(itemArgs) < 2 {
			gearItems = append(gearItems, GearItem{}) // Append empty GearItem for "nil" slots
			continue
		}

		itemID, err := strconv.Atoi(itemArgs[0])
		if err != nil {
			gearItems = append(gearItems, GearItem{}) // Append empty GearItem for "nil" slots
			continue
		}
		enchantID, err := strconv.Atoi(itemArgs[1])
		if err != nil {
			gearItems = append(gearItems, GearItem{}) // Append empty GearItem for "nil" slots
			continue
		}
		suffixID, err := strconv.Atoi(itemArgs[2])
		if err != nil {
			suffixID = 0 // Default to 0 if parsing fails
		}

		var tempEnchantID int
		if len(itemArgs) >= 4 {
			tempEnchantID, err = strconv.Atoi(itemArgs[3])
			if err != nil {
				gearItems = append(gearItems, GearItem{}) // Append empty GearItem for "nil" slots
				continue
			}
		}

		item := GearItem{
			Name:     name,
			ItemID:   itemID,
			SuffixID: suffixID,
		}
		if enchantID != 0 {
			item.EnchantID = &enchantID
		}
		if tempEnchantID != 0 {
			item.TempEnchantID = &tempEnchantID
		}

		gearItems = append(gearItems, item)
	}

	if len(gearItems) == 0 {
		return nil
	}
	return gearItems
}

type Talents struct {
	// Summary is the total number of points spent in each tree
	Summary [3]uint8
	// Trees contains the points spent in each talent per tree. Talents are numbered,
	// and each class has a different number of talents per tree.
	Trees [3][]uint8
	// TabNames are the talent tree names (e.g., "Arms", "Fury", "Protection").
	// Populated from COMBATANT_TALENTS; empty from COMBATANT_INFO (which lacks names).
	TabNames [3]string
}

// ParseTalents parses the talent string into a Talents struct
// 215303100000000000}055051000050122231}00000000000000000000
func ParseTalents(input string) (*Talents, error) {
	if input == "nil" || input == "" {
		return nil, nil
	}

	trees := strings.Split(input, "}")
	if len(trees) != 3 {
		return nil, fmt.Errorf("invalid talents format: %s", input)
	}

	tls := &Talents{
		Summary: [3]uint8{},
		Trees:   [3][]uint8{},
	}

	for i, tree := range trees {
		tls.Trees[i] = make([]uint8, len(tree))
		for j, char := range tree {
			val, err := strconv.ParseUint(string(char), 10, 8)
			if err != nil {
				return nil, fmt.Errorf("invalid talent character '%c' in talents: %v", char, err)
			}
			tls.Trees[i][j] = uint8(val)
			tls.Summary[i] += uint8(val)
		}
	}

	return tls, nil
}
