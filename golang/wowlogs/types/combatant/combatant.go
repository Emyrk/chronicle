package combatant

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
)

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
}

func (c *Combatant) IsMe() bool {
	return c.Talents != nil && c.Guid.IsPlayer()
}

func ParseCombatantInfo(content string) (Combatant, error) {
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

	ts, err := time.Parse(types.AddonDateFormat, info.timestamp())
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

	if info.guildName() != "" {
		player.Guild = &Guild{
			Name:      info.guildName(),
			RankName:  info.guildRankName(),
			RankIndex: info.guildRankIndex(),
		}
	}

	// Parse gear (items 9-27, 19 slots)
	gear, hasGear := info.gear()
	if hasGear {
		gearItems := make([]GearItem, 0, 19)
		for _, arg := range gear {
			if arg == "nil" {
				continue
			}

			itemArgs := strings.Split(arg, ":")
			if len(itemArgs) < 2 {
				continue
			}

			itemID, err := strconv.Atoi(itemArgs[0])
			if err != nil {
				// TODO: LOG
				continue
			}
			enchantID, err := strconv.Atoi(itemArgs[1])
			if err != nil {
				// TODO: LOG
				continue
			}

			item := GearItem{
				ItemID: itemID,
			}
			if enchantID != 0 {
				item.EnchantID = &enchantID
			}

			gearItems = append(gearItems, item)
		}
		player.GearSetups = gearItems
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
	RankIndex string
}

// GearItem represents an equipped item with optional enchant
type GearItem struct {
	ItemID    int
	EnchantID *int
	// TODO: slot source?
}

type Talents struct {
	// Summary is the total number of points spent in each tree
	Summary [3]uint8
	// Trees contains the points spent in each talent per tree. Talents are numbered,
	// and each class has a different number of talents per tree.
	Trees [3][]uint8
}

// ParseTalents parses the talent string into a Talents struct
// 215303100000000000}055051000050122231}00000000000000000000
func ParseTalents(input string) (*Talents, error) {
	if input == "nil" {
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
