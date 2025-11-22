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
	Talents    *string
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

	genderInt, err := strconv.ParseInt(info.heroClassLocal(), 10, 64)
	if err != nil {
		return empty, fmt.Errorf("invalid gender: %w", err)
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
