package vanilla

import (
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/gameversions"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Masterminds/semver"
)

// CombatantFields is the typed record input shared with the legacy adapter.
type CombatantFields interface {
	String() string
	Guid() guid.GUID
	OptionalGuid() *guid.GUID
	HeroClass() types.HeroClasses
	HeroRace() types.HeroRaces
	HeroGender() types.HeroGender
	Int32() int32
	Skip()
	Error() error
}

// CombatantOptions supplies only dataset values and optional gear/logging dependencies.
type CombatantOptions struct {
	TalentTrees *talents.TalentTreeData
	Gear        interface{ ResolveGear([]combatant.GearItem) }
	Logger      *slog.Logger
}

// CombatantState retains name-keyed equipment snapshots and transmog mappings.
// Its zero value is ready to use. Like Decoder, it is owned by one serial reader.
type CombatantState struct {
	transmogsByName       map[string]map[int32]transmogGearMapping
	latestCombatantByName map[string]combatant.Combatant
}

var (
	talentsSupported = semver.MustParse("0.19")
)

func (p *CombatantState) DecodeTransmog(ts time.Time, m CombatantFields) ([]messages.Message, error) {
	name := m.String()
	items := strings.Split(m.String(), "&")

	if err := m.Error(); err != nil {
		return nil, err
	}

	mogs := make([]combatant.Transmog, 0, len(items))
	for _, item := range items {
		parts := strings.Split(item, ":")
		if len(parts) != 3 {
			continue
		}

		slot, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}

		itemID, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}

		transmogID, err := strconv.Atoi(parts[2])
		if err != nil {
			continue
		}
		mogs = append(mogs, combatant.Transmog{
			Slot:       int32(slot - 1),
			ItemID:     int32(itemID),
			TransmogID: int32(transmogID),
		})
	}

	if len(mogs) == 0 {
		return nil, nil
	}

	transmogMessage := &messages.Transmog{
		MessageBase: messages.Base(ts),
		PlayerName:  name,
		Transmogs:   mogs,
	}
	p.recordTransmogs(name, mogs)
	if corrected := p.correctedCombatantForTransmog(name, ts); corrected != nil {
		return decoded(transmogMessage, corrected)
	}
	return decoded(transmogMessage)
}

// COMBATANT_TALENTS: guid|playerName|tab1|tab2|tab3
// Each tab: TabName;talentCount;rankDigits
func (p *CombatantState) DecodeTalents(ts time.Time, m CombatantFields, treeData *talents.TalentTreeData) ([]messages.Message, error) {
	id := m.Guid()
	name := m.String()

	var tabs [3]messages.CombatantTalentTab
	for i := 0; i < 3; i++ {
		raw := m.String()
		parts := strings.SplitN(raw, ";", 3)
		if len(parts) != 3 {
			return nil, fmt.Errorf("invalid talent tab format: %q", raw)
		}
		talentCount, err := strconv.Atoi(parts[1])
		if err != nil {
			return nil, fmt.Errorf("invalid talent count in talent tab: %w", err)
		}
		tabs[i] = messages.CombatantTalentTab{
			TabName:     parts[0],
			TalentCount: talentCount,
			RankDigits:  parts[2],
		}
	}

	if err := m.Error(); err != nil {
		return nil, err
	}

	tabs = canonicalTalentTabs(tabs, treeData)

	return decoded(&messages.CombatantTalents{
		MessageBase: messages.Base(ts),
		Guid:        id,
		PlayerName:  name,
		Tabs:        tabs,
	})
}

func (p *CombatantState) DecodeInfo(ts time.Time, m CombatantFields, version *gameversions.GameVersion, options CombatantOptions) ([]messages.Message, error) {
	var guild *combatant.Guild

	id := m.Guid()
	name := m.String()
	class := m.HeroClass()
	race := m.HeroRace()
	gender := m.HeroGender()
	guildName := m.String()
	if guildName != "" {
		guildRankName := m.String()
		guildRank := m.Int32()
		guild = &combatant.Guild{
			Name:      guildName,
			RankName:  guildRankName,
			RankIndex: guildRank,
		}
	} else {
		m.Skip()
		m.Skip()
	}
	gearStr := m.String()
	talentsStr := m.String()
	petName := m.String()
	petGuid := m.OptionalGuid()

	var _ = petGuid
	if err := m.Error(); err != nil {
		return nil, err
	}

	if version != nil &&
		version.ChronicleCompanionAddon.LessThan(talentsSupported) {
		talentsStr = ""
	}

	playerTalents, err := combatant.ParseTalents(talentsStr)
	if err != nil {
		playerTalents = nil
		if options.Logger != nil {
			options.Logger.Error("parsing talents, setting to nil", "error", err)
		}
	}
	playerTalents = canonicalCombatantTalents(playerTalents, class, options.TalentTrees)

	gear := combatant.ParseGear(strings.Split(gearStr, "&"))
	if options.Gear != nil {
		options.Gear.ResolveGear(gear)
	}

	player := combatant.Combatant{
		Name:       name,
		Guid:       id,
		Seen:       ts,
		HeroClass:  class,
		Gender:     gender,
		Race:       race,
		PetName:    petName,
		Guild:      guild,
		GearSetups: gear,
		Talents:    playerTalents,
	}
	p.applyKnownTransmogs(&player)
	p.rememberCombatant(player)
	return decoded(&messages.Combatant{
		MessageBase: messages.Base(ts),
		Combatant:   player,
	})
}
