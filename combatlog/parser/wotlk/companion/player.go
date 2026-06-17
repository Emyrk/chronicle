package companion

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/internal/ptr"
)

// PlayerData accumulates segment data for a single player.
// Segments arrive independently at different cadences.
type PlayerData struct {
	GUID      guid.GUID
	Name      string
	HeroClass types.HeroClasses
	Race      types.HeroRaces
	Gender    types.HeroGender
	Level     int

	Guild   *combatant.Guild
	Gear    []combatant.GearItem
	Talents *combatant.Talents
	Glyphs  *combatant.Glyphs
	PetName string
	PetGUID *guid.GUID
}

// toCombatantMessage converts accumulated player data into a Combatant message.
func (pd *PlayerData) toCombatantMessage(ts time.Time) *messages.Combatant {
	return &messages.Combatant{
		MessageBase: messages.Base(ts),
		Combatant: combatant.Combatant{
			Name:       pd.Name,
			Guid:       pd.GUID,
			Seen:       ts,
			HeroClass:  pd.HeroClass,
			Gender:     pd.Gender,
			Race:       pd.Race,
			PetName:    pd.PetName,
			Guild:      pd.Guild,
			GearSetups: pd.Gear,
			Talents:    pd.Talents,
			Glyphs:     pd.Glyphs,
			Level:      ptr.Ref(int32(pd.Level)),
		},
	}
}

// parsePlayer parses P<guid>;<segment> and dispatches to segment parsers.
func (p *Parser) parsePlayer(ts time.Time, data string) ([]messages.Message, error) {
	// Find the semicolon separating GUID from segment.
	semiIdx := strings.IndexByte(data, ';')
	if semiIdx < 0 {
		return nil, fmt.Errorf("player: missing semicolon separator")
	}

	guidStr := data[:semiIdx]
	segment := data[semiIdx+1:]
	if len(segment) == 0 {
		return nil, fmt.Errorf("player: empty segment")
	}

	gid, err := guid.FromString(guidStr)
	if err != nil {
		return nil, fmt.Errorf("player: invalid GUID %q: %w", guidStr, err)
	}

	// Get or create player data.
	pd, ok := p.players[gid]
	if !ok {
		pd = &PlayerData{GUID: gid}
		p.players[gid] = pd
	}

	segType := segment[0]
	segData := segment[1:]

	switch segType {
	case 'I':
		return p.parseIdentity(ts, pd, segData)
	case 'G':
		return p.parseGear(ts, pd, segData)
	case 'T':
		return p.parseTalents(ts, pd, segData)
	case 'Y':
		return p.parseGlyphs(ts, pd, segData)
	case 'U':
		return p.parseGuild(ts, pd, segData)
	case 'E':
		return p.parsePet(ts, pd, segData)
	case 'H':
		// Honor stats — log and skip for now.
		//p.logger.Debug("companion: player honor segment", "guid", gid.String(), "data", segData)
		return nil, nil
	case 'A':
		// Arena stats — log and skip for now.
		//p.logger.Debug("companion: player arena segment", "guid", gid.String(), "data", segData)
		return nil, nil
	default:
		return nil, fmt.Errorf("player: unknown segment type %q", string(segType))
	}
}

// parseIdentity parses: I<name>,<class>,<race>,<gender>,<level>
func (p *Parser) parseIdentity(ts time.Time, pd *PlayerData, data string) ([]messages.Message, error) {
	parts := strings.Split(data, ",")
	if len(parts) < 5 {
		return nil, fmt.Errorf("identity: expected 5 fields, got %d", len(parts))
	}

	name := parts[0]
	classToken := parts[1]
	raceToken := parts[2]
	genderInt, err := strconv.Atoi(parts[3])
	if err != nil {
		return nil, fmt.Errorf("identity: invalid gender %q: %w", parts[3], err)
	}
	level, err := strconv.Atoi(parts[4])
	if err != nil {
		return nil, fmt.Errorf("identity: invalid level %q: %w", parts[4], err)
	}

	heroClass, err := types.ParseHeroClasses(classToken)
	if err != nil {
		return nil, fmt.Errorf("identity: %w", err)
	}
	heroRace, err := types.ParseHeroRaces(raceToken)
	if err != nil {
		return nil, fmt.Errorf("identity: %w", err)
	}

	// Map addon gender (1=unknown, 2=male, 3=female) to types.HeroGender.
	gender := mapGender(genderInt)

	pd.Name = name
	pd.HeroClass = heroClass
	pd.Race = heroRace
	pd.Gender = gender
	pd.Level = level

	return []messages.Message{pd.toCombatantMessage(ts)}, nil
}

// parseGear parses: G<slot>.<itemId>.<enchant>.<gem1>.<gem2>.<gem3>.<gem4>.<suffix>.<itemLevel>:<next slot>:...
// The slot index (fields[0]) is 1-based (1=Head, 2=Neck, ... 19=Tabard) and maps to a
// fixed 19-element array so items land in the correct equipment slot positions.
func (p *Parser) parseGear(ts time.Time, pd *PlayerData, data string) ([]messages.Message, error) {
	if data == "" {
		return nil, fmt.Errorf("gear: empty data")
	}

	slots := strings.Split(data, ":")
	gear := make([]combatant.GearItem, 19)

	for _, slot := range slots {
		if slot == "" {
			continue
		}
		fields := strings.Split(slot, ".")
		if len(fields) < 9 {
			return nil, fmt.Errorf("gear: expected 9 fields per slot, got %d in %q", len(fields), slot)
		}

		// Fields: slot, itemId, enchant, gem1, gem2, gem3, gem4, suffix, itemLevel
		slotIndex, err := strconv.Atoi(fields[0])
		if err != nil || slotIndex < 1 || slotIndex > 19 {
			return nil, fmt.Errorf("gear: invalid slot index %q", fields[0])
		}

		itemID, err := strconv.Atoi(fields[1])
		if err != nil {
			return nil, fmt.Errorf("gear: invalid itemId %q: %w", fields[1], err)
		}
		enchantID, _ := strconv.Atoi(fields[2])
		gem1, _ := strconv.Atoi(fields[3])
		gem2, _ := strconv.Atoi(fields[4])
		gem3, _ := strconv.Atoi(fields[5])
		gem4, _ := strconv.Atoi(fields[6])
		suffixID, _ := strconv.Atoi(fields[7])
		itemLevel, _ := strconv.Atoi(fields[8])

		item := combatant.GearItem{
			ItemID:    itemID,
			SuffixID:  suffixID,
			Gems:      [4]int{gem1, gem2, gem3, gem4},
			ItemLevel: itemLevel,
		}
		if enchantID != 0 {
			item.EnchantID = &enchantID
		}
		gear[slotIndex-1] = item
	}

	pd.Gear = gear
	return []messages.Message{pd.toCombatantMessage(ts)}, nil
}

// parseTalents parses: T<activeGroup>,<numGroups>,<rankString1>,<rankString2>
// Rank strings use '}' as tree separator.
func (p *Parser) parseTalents(ts time.Time, pd *PlayerData, data string) ([]messages.Message, error) {
	parts := strings.SplitN(data, ",", 4)
	if len(parts) < 3 {
		return nil, fmt.Errorf("talents: expected at least 3 fields, got %d", len(parts))
	}

	// parts[0] = activeGroup, parts[1] = numGroups
	// parts[2] = rankString for the active spec (use this one)
	rankStr := parts[2]

	talents, err := combatant.ParseTalents(rankStr)
	if err != nil {
		return nil, fmt.Errorf("talents: %w", err)
	}

	pd.Talents = talents
	return []messages.Message{pd.toCombatantMessage(ts)}, nil
}

// parseGlyphs parses: Y<activeGroup>,<major1>.<major2>.<major3>.<minor1>.<minor2>.<minor3>:<group2 same format>
func (p *Parser) parseGlyphs(ts time.Time, pd *PlayerData, data string) ([]messages.Message, error) {
	parts := strings.SplitN(data, ",", 2)
	if len(parts) < 2 {
		return nil, fmt.Errorf("glyphs: expected activeGroup,data, got %q", data)
	}

	activeGroup, err := strconv.Atoi(parts[0])
	if err != nil {
		return nil, fmt.Errorf("glyphs: invalid activeGroup %q: %w", parts[0], err)
	}

	// Groups are colon-separated.
	groups := strings.Split(parts[1], ":")
	glyphs := &combatant.Glyphs{
		ActiveGroup: activeGroup,
		Groups:      make([]combatant.GlyphGroup, 0, len(groups)),
	}

	for _, group := range groups {
		ids := strings.Split(group, ".")
		if len(ids) < 6 {
			return nil, fmt.Errorf("glyphs: expected 6 spell IDs per group, got %d", len(ids))
		}
		var gg combatant.GlyphGroup
		for i := 0; i < 3; i++ {
			gg.Major[i], _ = strconv.Atoi(ids[i])
		}
		for i := 0; i < 3; i++ {
			gg.Minor[i], _ = strconv.Atoi(ids[3+i])
		}
		glyphs.Groups = append(glyphs.Groups, gg)
	}

	pd.Glyphs = glyphs
	return []messages.Message{pd.toCombatantMessage(ts)}, nil
}

// parseGuild parses: U<guildName>
func (p *Parser) parseGuild(ts time.Time, pd *PlayerData, data string) ([]messages.Message, error) {
	if data == "" {
		pd.Guild = nil
	} else {
		pd.Guild = &combatant.Guild{Name: data}
	}
	return []messages.Message{pd.toCombatantMessage(ts)}, nil
}

// parsePet parses: E<name>,<guid>
func (p *Parser) parsePet(ts time.Time, pd *PlayerData, data string) ([]messages.Message, error) {
	if pd == nil {
		return nil, fmt.Errorf("parsePet: nil PlayerData")
	}

	parts := strings.SplitN(data, ",", 2)
	if len(parts) < 2 {
		return nil, fmt.Errorf("pet: expected name,guid, got %q", data)
	}

	pd.PetName = parts[0]
	petGUID, err := guid.FromString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("pet: invalid GUID %q: %w", parts[1], err)
	}
	pd.PetGUID = &petGUID
	return []messages.Message{
		&messages.NewOwner{
			MessageBase: messages.Base(ts),
			Target:      petGUID,
			NewOwner:    pd.GUID,
		},
		pd.toCombatantMessage(ts),
	}, nil
}

// mapGender converts addon gender values (1=unknown, 2=male, 3=female) to HeroGender.
func mapGender(addonGender int) types.HeroGender {
	switch addonGender {
	case 2:
		return types.HeroGenderMale
	case 3:
		return types.HeroGenderFemale
	default:
		return types.HeroGenderUnknown
	}
}
