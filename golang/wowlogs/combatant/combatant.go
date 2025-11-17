package combatant

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Combatant is the raw parsing. Additional logic should be build ontop
// to handle things like enums.
type Combatant struct {
	Name      string
	Seen      time.Time
	HeroClass string
	Gender    string
	// 1 == female, 2 == male
	Race    string
	PetName string

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

	if !strings.HasPrefix(content, "COMBATANT_INFO:") {
		return empty, fmt.Errorf("not a COMBATANT_INFO message")
	}

	info := splitInfo(content)
	if len(info) <= 27 {
		return empty, fmt.Errorf("insufficient arguments in COMBATANT_INFO message, got %d, want at least 27", len(info))
	}

	ts, err := time.Parse("02.01.06 15:04:05", info.timestamp())
	if err != nil {
		return empty, fmt.Errorf("invalid timestamp format in COMBATANT_INFO message: %v", err)
	}

	player := Combatant{
		Seen:       ts,
		Name:       info.name(),
		HeroClass:  info.heroClassLocal(),
		Gender:     info.genderLocal(),
		Race:       info.raceLocal(),
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
