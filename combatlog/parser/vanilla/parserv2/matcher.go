package parserv2

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/gameversions"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/Masterminds/semver"
)

const dateLayout = "02.01.06 15:04:05"

func (p *Parser) header(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	player := m.OptionalGuid()
	realmName := m.String()
	zoneName := m.String()
	addonVersion := m.String()
	superWoWVersion := m.String()
	namPowerVersion := m.String()
	xp3Version := m.String()
	wowVersion := m.String()
	wowBuild := m.Int32()
	wowBuildDate := m.String()
	localTimeStr := m.String()
	utcTimeStr := m.String()

	var classicAPIVersion string
	if m.Remain() > 0 {
		m.skip() // combat log range
	}
	if m.Remain() > 0 {
		classicAPIVersion = m.String()
	}
	if m.Remain() > 0 {
		m.skip() // threat mode
	}

	// TODO: If ts is 0, set to utc time

	var _ = zoneName

	if err := m.Error(); err != nil {
		return nil, err
	}

	localTime, err := time.Parse(dateLayout, localTimeStr)
	if err != nil {
		return nil, fmt.Errorf("parsing local time: %w", err)
	}
	var _ = localTime

	utcTime, err := time.Parse(dateLayout, utcTimeStr)
	if err != nil {
		return nil, fmt.Errorf("parsing local time: %w", err)
	}

	if ts.IsZero() {
		ts = utcTime
	}

	chronicleCompanion, ccv := semver.NewVersion(addonVersion)

	if ccv == nil {
		p.gameVersions = &gameversions.GameVersion{
			ChronicleCompanionAddon: chronicleCompanion,
		}
	}

	versions := make(map[string]string)
	if addonVersion != "" {
		versions["chronicle_companion"] = addonVersion
		versions["addon"] = addonVersion
	}
	if superWoWVersion != "" {
		versions["superwow"] = superWoWVersion
	}
	if namPowerVersion != "" {
		versions["nampower"] = namPowerVersion
	}
	if xp3Version != "" {
		versions["xp3"] = xp3Version
	}
	if classicAPIVersion != "" {
		versions["classicapi"] = classicAPIVersion
	}
	if wowVersion != "" {
		versions["wow_client"] = wowVersion
	}
	if wowBuild != 0 {
		versions["wow_build"] = fmt.Sprintf("%d", wowBuild)
	}
	versions["chronicle"] = version.GitTag

	return set(
		//&messages.Zone{
		//	MessageBase: messages.Base(ts),
		//	Zone: zone.Zone{
		//		Name:         zoneName,
		//		InstanceID:   0,
		//		Ghost:        false,
		//		InstanceType: "",
		//		IsInstance:   false,
		//	},
		//},
		&messages.Realm{
			MessageBase: messages.Base(ts),
			Info: realm.Info{
				Seen:      ts,
				Version:   wowVersion,
				Build:     int(wowBuild),
				BuildDate: wowBuildDate,
				RealmName: realmName,
			},
		},
		&messages.Versions{
			MessageBase: messages.Base(ts),
			Player:      player,
			Versions:    versions,
		},
	)
}

func (p *Parser) auraCast(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeAuraCast(p.ctx, p, ts, m)
}

func (p *Parser) auraUpdate(ctx context.Context, ts time.Time, buff bool, m *Matched) ([]messages.Message, error) {
	return messages.Skip(ts, "not yet implements"), nil
}

func (p *Parser) energize(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeEnergize(p.ctx, p.wowDB, ts, m)
}

func (p *Parser) aura(ctx context.Context, event string, ts time.Time, buff bool, m *Matched) ([]messages.Message, error) {
	return next.DecodeAura(p.ctx, p.wowDB, event, ts, buff, m)
}

// raidComposition parses a roster-index snapshot. The encoded subgroup is the
// authority for group membership. Raid index orders members within each group.
// Rank, roster index, and reason are not part of the downstream message model.
func (p *Parser) raidComposition(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	reason := m.String()
	memberCount := m.Int32()
	payload := m.String()
	if err := m.Error(); err != nil {
		return nil, err
	}
	if m.Remain() != 0 {
		return nil, fmt.Errorf("raid composition: unexpected extra fields")
	}
	if reason == "" {
		return nil, fmt.Errorf("raid composition: reason is required")
	}
	if memberCount < 0 || memberCount > messages.RaidGroupCount*messages.RaidGroupSize {
		return nil, fmt.Errorf("raid composition: invalid member count %d", memberCount)
	}

	result := &messages.RaidGroup{MessageBase: messages.Base(ts)}
	if memberCount == 0 {
		if payload != "" {
			return nil, fmt.Errorf("raid composition: expected empty payload for zero members")
		}
		p.sawRaidGroup = true
		return set(result)
	}

	entries := strings.Split(payload, ";")
	if len(entries) != int(memberCount) {
		return nil, fmt.Errorf("raid composition: expected %d members, got %d", memberCount, len(entries))
	}

	previousIndex := 0
	groupSizes := [messages.RaidGroupCount]int{}
	for i, entry := range entries {
		parts := strings.Split(entry, ",")
		if len(parts) != 4 {
			return nil, fmt.Errorf("raid composition: member %d expected 4 fields, got %d", i+1, len(parts))
		}

		member, err := parseRaidGUID(parts[0])
		if err != nil {
			return nil, fmt.Errorf("raid composition: invalid GUID %q at member %d: %w", parts[0], i+1, err)
		}
		raidIndex, err := strconv.Atoi(parts[1])
		if err != nil || raidIndex < 1 || raidIndex > messages.RaidGroupCount*messages.RaidGroupSize {
			return nil, fmt.Errorf("raid composition: invalid raid index %q at member %d", parts[1], i+1)
		}
		if raidIndex <= previousIndex {
			return nil, fmt.Errorf("raid composition: raid indexes must be strictly ascending")
		}
		subgroup, err := strconv.Atoi(parts[2])
		if err != nil || subgroup < 1 || subgroup > messages.RaidGroupCount {
			return nil, fmt.Errorf("raid composition: invalid subgroup %q at member %d", parts[2], i+1)
		}
		rank, err := strconv.Atoi(parts[3])
		if err != nil || rank < 0 || rank > 2 {
			return nil, fmt.Errorf("raid composition: invalid rank %q at member %d", parts[3], i+1)
		}

		groupIndex := subgroup - 1
		slotIndex := groupSizes[groupIndex]
		if slotIndex >= messages.RaidGroupSize {
			return nil, fmt.Errorf("raid composition: subgroup %d has more than %d members", subgroup, messages.RaidGroupSize)
		}
		result.Groups[groupIndex][slotIndex] = member
		groupSizes[groupIndex]++
		previousIndex = raidIndex
	}

	p.sawRaidGroup = true
	return set(result)
}

func parseRaidGUID(field string) (guid.GUID, error) {
	hex := strings.TrimPrefix(strings.TrimPrefix(field, "0x"), "0X")
	value, err := strconv.ParseUint(hex, 16, 64)
	if err != nil || value == 0 {
		if err == nil {
			err = fmt.Errorf("zero GUID")
		}
		return 0, err
	}
	return guid.GUID(value), nil
}

// raidGroup parses forty compact hexadecimal GUID fields representing eight
// five-player raid groups. Empty fields preserve unused slots and subgroup boundaries.
func (p *Parser) raidGroup(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	fields := strings.Split(m.String(), ",")
	if err := m.Error(); err != nil {
		return nil, err
	}

	expectedFields := messages.RaidGroupCount * messages.RaidGroupSize
	if len(fields) != expectedFields {
		return nil, fmt.Errorf("raid group: expected %d fields, got %d", expectedFields, len(fields))
	}

	result := &messages.RaidGroup{MessageBase: messages.Base(ts)}
	for i, field := range fields {
		if field == "" {
			continue
		}

		member, err := parseRaidGUID(field)
		if err != nil {
			return nil, fmt.Errorf("raid group: invalid GUID %q at field %d: %w", field, i+1, err)
		}
		result.Groups[i/messages.RaidGroupSize][i%messages.RaidGroupSize] = member
	}

	p.sawRaidGroup = true
	return set(result)
}

func (p *Parser) zoneInfo(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	name := m.String()
	instanceID := m.OptionalUint32()
	inInstance := m.Int64() == 1
	instanceType := m.String() // none, party, raid, pvp
	isGhost := m.Int64() == 1
	var mapID uint32
	if m.Remain() > 0 {
		mapID = m.OptionalUint32()
	}

	if err := m.Error(); err != nil {
		return nil, err
	}

	return set(&messages.Zone{
		MessageBase: messages.Base(ts),
		Zone: zone.Zone{
			Seen: ts,
			// For some reason, a zone name came across as all caps once.
			Name:         strings.ToLower(name),
			MapID:        mapID,
			InstanceID:   instanceID,
			Ghost:        isGhost,
			InstanceType: instanceType,
			IsInstance:   inInstance,
		},
	})
}

func (p *Parser) unitInfo(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	id := m.Guid()
	isPlayer := m.Bool()
	name := m.String()
	canCooperate := m.Int64() == 1
	owner := m.OptionalGuid()
	buffs, err := unitinfo.ParseBuffs(m.String())
	if err != nil {
		return nil, fmt.Errorf("unit buffs: %w", err)
	}
	level := m.Int64()
	challenges := m.CSV()
	maxHealth := m.Int64()
	var charm *guid.GUID
	if m.Remain() > 0 {
		charm = m.OptionalGuid()
	}

	if err := m.Error(); err != nil {
		return nil, err
	}

	// This feels a bit jank, but the WoW `UnitName` function can return "Unknown".
	// Unsure why, but when it does that name will be propagated up. In some cases,
	// if we know it is not a player, and it has an entry ID, we can fix the name
	// here. Maintaining a list of seen "unknowns" hopefully does not get that large.
	if (name == "Unknown" || name == "") && !id.IsPlayer() {
		knownName := unitname.ByGUID(id)
		if knownName != "" {
			name = knownName
		}
	}

	return set(&messages.Unit{
		MessageBase: messages.Base(ts),
		Info: unitinfo.Info{
			Seen:         ts,
			Guid:         id,
			IsPlayer:     isPlayer,
			Name:         name,
			CanCooperate: canCooperate,
			Owner:        owner,
			Buffs:        buffs,
			Level:        int32(level),
			Challenges:   challenges,
			Charm:        charm,
			MaxHealth:    maxHealth,
		},
	})
}

func (p *Parser) unitState(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	unit := m.Guid()
	healthRaw := m.String()
	maximumHealthRaw := m.String()
	powerRaw := m.String()
	maximumPowerRaw := m.String()
	powerTypeRaw := m.String()
	mapIDRaw := m.String()
	xRaw := m.String()
	yRaw := m.String()
	zRaw := m.String()
	if err := m.Error(); err != nil {
		return nil, err
	}
	if m.Remain() != 0 {
		return nil, fmt.Errorf("unit state: unexpected extra fields")
	}

	currentHealth, hasCurrentHealth, err := parseOptionalInt64("current health", healthRaw)
	if err != nil {
		return nil, err
	}
	maximumHealth, hasMaximumHealth, err := parseOptionalInt64("maximum health", maximumHealthRaw)
	if err != nil {
		return nil, err
	}
	currentPower, _, err := parseOptionalInt32("current power", powerRaw)
	if err != nil {
		return nil, err
	}
	maximumPower, _, err := parseOptionalInt32("maximum power", maximumPowerRaw)
	if err != nil {
		return nil, err
	}
	powerType, hasPowerType, err := parseOptionalInt32("power type", powerTypeRaw)
	if err != nil {
		return nil, err
	}

	result := make([]messages.Message, 0, 2)
	if hasCurrentHealth && hasMaximumHealth {
		resource := types.ResourceUnknown
		if hasPowerType {
			resource = PowerTypeResource(powerType)
		}
		result = append(result, &messages.UnitResources{
			MessageBase:   messages.Base(ts),
			Unit:          unit,
			CurrentHealth: currentHealth,
			MaximumHealth: maximumHealth,
			PowerType:     resource,
			CurrentPower:  currentPower,
			MaximumPower:  maximumPower,
		})
		p.sawUnitResources = true
	}

	mapID, _, err := parseOptionalInt32("map ID", mapIDRaw)
	if err != nil {
		return nil, err
	}
	x, hasX, err := parseOptionalFloat64("x", xRaw)
	if err != nil {
		return nil, err
	}
	y, hasY, err := parseOptionalFloat64("y", yRaw)
	if err != nil {
		return nil, err
	}
	z, hasZ, err := parseOptionalFloat64("z", zRaw)
	if err != nil {
		return nil, err
	}
	var optionalZ *float64
	if hasZ {
		optionalZ = ptr.Ref(z)
	}
	if hasX && hasY {
		result = append(result, &messages.UnitPosition{
			MessageBase: messages.Base(ts),
			Unit:        unit,
			X:           x,
			Y:           y,
			Z:           optionalZ,
			MapID:       mapID,
		})
		p.sawUnitPosition = true
	}

	return result, nil
}

func parseOptionalInt64(name, raw string) (int64, bool, error) {
	if raw == "" {
		return 0, false, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, false, fmt.Errorf("unit state: parse %s %q: %w", name, raw, err)
	}
	return value, true, nil
}

func parseOptionalInt32(name, raw string) (int32, bool, error) {
	value, present, err := parseOptionalInt64(name, raw)
	if err != nil {
		return 0, false, err
	}
	if value < -1<<31 || value > 1<<31-1 {
		return 0, false, fmt.Errorf("unit state: parse %s %q: value out of int32 range", name, raw)
	}
	return int32(value), present, nil
}

func parseOptionalFloat64(name, raw string) (float64, bool, error) {
	if raw == "" {
		return 0, false, nil
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, false, fmt.Errorf("unit state: parse %s %q: %w", name, raw, err)
	}
	return value, true, nil
}

var (
	talentsSupported = semver.MustParse("0.19")
)

func (p *Parser) combatantTransmog(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
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
		return set(transmogMessage, corrected)
	}
	return set(transmogMessage)
}

// COMBATANT_TALENTS: guid|playerName|tab1|tab2|tab3
// Each tab: TabName;talentCount;rankDigits
func (p *Parser) combatantTalents(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
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

	_, treeData := parsectx.DatasetTalents(ctx)
	tabs = canonicalTalentTabs(tabs, treeData)

	return set(&messages.CombatantTalents{
		MessageBase: messages.Base(ts),
		Guid:        id,
		PlayerName:  name,
		Tabs:        tabs,
	})
}

// canonicalTalentTabs normalizes addon-provided tab order to the dataset's
// canonical order. Some localized clients emit the three tabs in a different
// order, so treating their positions as Balance/Feral/Restoration (and similar)
// corrupts both specialization inference and the displayed talent build.
func canonicalTalentTabs(input [3]messages.CombatantTalentTab, treeData *talents.TalentTreeData) [3]messages.CombatantTalentTab {
	if treeData == nil {
		return input
	}

	// Exact tab names are authoritative when the client and dataset use the same locale.
	for _, classData := range treeData.Classes {
		ordered := orderedTalentTabs(classData.Tabs)
		if len(ordered) != len(input) {
			continue
		}
		var result [3]messages.CombatantTalentTab
		used := [3]bool{}
		matched := true
		for canonicalIndex, tab := range ordered {
			found := -1
			for inputIndex, candidate := range input {
				if !used[inputIndex] && strings.EqualFold(candidate.TabName, tab.Name) {
					found = inputIndex
					break
				}
			}
			if found < 0 {
				matched = false
				break
			}
			used[found] = true
			result[canonicalIndex] = input[found]
			result[canonicalIndex].TabName = tab.Name
		}
		if matched {
			return result
		}
	}

	// Localized names cannot be compared to the English dataset. The number of
	// rank digits still identifies the tabs for classes whose three tree sizes
	// have exactly one possible dataset match. Ambiguous matches are left alone.
	permutations := [][3]int{
		{0, 1, 2}, {0, 2, 1}, {1, 0, 2},
		{1, 2, 0}, {2, 0, 1}, {2, 1, 0},
	}
	var result [3]messages.CombatantTalentTab
	matches := 0
	for _, classData := range treeData.Classes {
		ordered := orderedTalentTabs(classData.Tabs)
		if len(ordered) != len(input) {
			continue
		}
		for _, permutation := range permutations {
			matched := true
			for canonicalIndex, inputIndex := range permutation {
				if len(input[inputIndex].RankDigits) != len(ordered[canonicalIndex].Talents) {
					matched = false
					break
				}
			}
			if !matched {
				continue
			}
			matches++
			for canonicalIndex, inputIndex := range permutation {
				result[canonicalIndex] = input[inputIndex]
				result[canonicalIndex].TabName = ordered[canonicalIndex].Name
			}
		}
	}
	if matches == 1 {
		return result
	}
	return input
}

func canonicalCombatantTalents(input *combatant.Talents, class types.HeroClasses, treeData *talents.TalentTreeData) *combatant.Talents {
	if input == nil || treeData == nil {
		return input
	}

	classID, ok := talentClassID(class)
	if !ok {
		return input
	}
	classData, ok := treeData.Classes[classID]
	if !ok {
		return input
	}
	ordered := orderedTalentTabs(classData.Tabs)
	if len(ordered) != len(input.Trees) {
		return input
	}

	permutations := [][3]int{
		{0, 1, 2}, {0, 2, 1}, {1, 0, 2},
		{1, 2, 0}, {2, 0, 1}, {2, 1, 0},
	}
	var match [3]int
	matches := 0
	for _, permutation := range permutations {
		matched := true
		for canonicalIndex, inputIndex := range permutation {
			if len(input.Trees[inputIndex]) != len(ordered[canonicalIndex].Talents) {
				matched = false
				break
			}
		}
		if matched {
			match = permutation
			matches++
		}
	}
	if matches != 1 {
		return input
	}

	result := &combatant.Talents{}
	for canonicalIndex, inputIndex := range match {
		result.Summary[canonicalIndex] = input.Summary[inputIndex]
		result.Trees[canonicalIndex] = input.Trees[inputIndex]
		result.TabNames[canonicalIndex] = ordered[canonicalIndex].Name
	}
	return result
}

func talentClassID(class types.HeroClasses) (int32, bool) {
	switch class {
	case types.HeroClassesWARRIOR:
		return 1, true
	case types.HeroClassesPALADIN:
		return 2, true
	case types.HeroClassesHUNTER:
		return 3, true
	case types.HeroClassesROGUE:
		return 4, true
	case types.HeroClassesPRIEST:
		return 5, true
	case types.HeroClassesDEATHKNIGHT:
		return 6, true
	case types.HeroClassesSHAMAN:
		return 7, true
	case types.HeroClassesMAGE:
		return 8, true
	case types.HeroClassesWARLOCK:
		return 9, true
	case types.HeroClassesDRUID:
		return 11, true
	default:
		return 0, false
	}
}

func orderedTalentTabs(input []talents.TalentTabData) []talents.TalentTabData {
	ordered := append([]talents.TalentTabData(nil), input...)
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].OrderIndex < ordered[j].OrderIndex
	})
	return ordered
}

func (p *Parser) combatantInfo(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
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
		m.skip()
		m.skip()
	}
	gearStr := m.String()
	talentsStr := m.String()
	petName := m.String()
	petGuid := m.OptionalGuid()

	var _ = petGuid
	if err := m.Error(); err != nil {
		return nil, err
	}

	if p.gameVersions != nil &&
		p.gameVersions.ChronicleCompanionAddon.LessThan(talentsSupported) {
		talentsStr = ""
	}

	playerTalents, err := combatant.ParseTalents(talentsStr)
	if err != nil {
		playerTalents = nil
		p.logger.Error("parsing talents, setting to nil", "error", err)
	}
	_, treeData := parsectx.DatasetTalents(ctx)
	playerTalents = canonicalCombatantTalents(playerTalents, class, treeData)

	gear := combatant.ParseGear(strings.Split(gearStr, "&"))
	if p.itemFetcher != nil {
		p.itemFetcher.ResolveGear(gear)
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
	return set(&messages.Combatant{
		MessageBase: messages.Base(ts),
		Combatant:   player,
	})
}

// 1771542038|SWING|0xF130002C3600BE05|0x000000000001C80A|52|2|1|1|0|0|0
func (p *Parser) swing(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeSwing(p.ctx, p.wowDB, ts, m)
}

// 1771542037|HEAL|0x000000000001C80A|0x000000000001C80A|27805|507|0|0
func (p *Parser) heal(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeHeal(p.ctx, p, ts, m)
}

func (p *Parser) spellMiss(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeMiss(p.ctx, p, ts, m)
}

func (p *Parser) dmgShield(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeDamageShield(p.ctx, p.wowDB, ts, m)
}

func (p *Parser) envDmg(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeEnvironmentDamage(p.ctx, p.wowDB, ts, m)
}

// 1771564201000|SPELL_DMG|0xF130002C3800949D|0x000000000001C7AC|22482|67|0,0,0|0|0|2,0,0,0

// Moonfire hit and tick
// 1771966668876|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|329|0,0,0|0|6|6,2,0,0
// 1771966671851|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|170|0,0,0|0|6|6,2,0,3
// 1771966674890|SPELL_DMG|0xF13000C55326FDD0|0x000000000003054A|9835|170|0,0,0|0|6|6,2,0,3
func (p *Parser) spell_dmg(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeSpellDamage(p.ctx, p, ts, m)
}

// powerBurnResourceChange synthesizes a ResourceChange for SPELL_DMG lines
// produced by SPELL_EFFECT_POWER_BURN (62) or SPELL_AURA_POWER_BURN_MANA (162).
//
// Each point of power burned deals damage multiplied by the effect's damage
// multiplier (EffectAmplitude, e.g. 0.5 for Mana Burn rank 5: "for each mana
// drained in this way, the target takes 0.5 Shadow damage"), so the power
// drained is recovered from the pre-mitigation damage:
// (amount + absorbed + blocked + resisted) / multiplier.
// The damage component can crit (1.5x for spells) but the drain does not, so
// crits are divided back out.
// Example line (Mana Burn rank 5 fully absorbed by a shield, 916 mana burned):
//
//	1784050453916|SPELL_DMG|0xF130006287017F8B|0x000000000001D795|10876|0|458,0,0|0|5|62,0,0,0
//
// Returns nil when the event is not a power burn or no power was drained.
func powerBurnResourceChange(
	ts time.Time,
	spell *chrondbc.Spell,
	caster guid.GUID,
	target guid.GUID,
	amount int32,
	mitigated []int32,
	effects []int32,
	crit bool,
) messages.Message {
	return next.PowerBurnResourceChange(ts, spell, caster, target, amount, mitigated, effects, crit)
}

//func (p *Parser) spellStart(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
//	itemID := m.Int32() // 0 if no item triggered it
//	spellData := m.DBCSpellByID(p.ctx, p)
//	caster := m.Guid()
//	target := m.OptionalGuid() // 0x0000000000000000 if no target
//	castFlags := m.CastFlags()
//	castTime := m.Int32()        // In millis
//	channelDuration := m.Int32() // In millis, 0 if not a channel
//	spellType := m.Int32()       // 0 = normal, 1 = channel, 2 = auto repeating
//	corpseOwner := m.OptionalGuid()
//
//	if err := m.Error(); err != nil {
//		return nil, err
//	}
//
//	var item *int32
//	if itemID != 0 {
//		item = ptr.Ref(itemID)
//	}
//
//	return set(&messages.SpellGo{
//		MessageBase:      messages.Base(ts),
//		ItemID:           item,
//		SpellID:          spellData.ID,
//		SpellData:        spellData,
//		Caster:           caster,
//		Target:           target,
//		Flags:            castFlags,
//		NumTargetsHit:    targetsHit,
//		NumTargetsMissed: numMissed,
//		CorpseOwner:      corpseOwner,
//	})
//}

// spellGo does indicate a spell being landed/missed. These logs also appear as
// SPELL_DMG and "MISS" logs.
func (p *Parser) spellGo(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeSpellGo(p.ctx, p, ts, m)
}

func (p *Parser) spellStart(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeSpellStart(p.ctx, p, ts, m)
}

func (p *Parser) spellFail(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	if !strings.HasPrefix(strings.TrimSpace(m.peek()), "0x") {
		// Client failure, ignoring for now.
		return []messages.Message{}, nil
	}

	caster := m.Guid()
	spell := m.DBCSpellByID(p.ctx, p.wowDB)
	serverSide := true
	if m.Remain() > 0 {
		serverSide = m.Bool()
	}

	if !serverSide {
		return []messages.Message{}, nil
	}

	return set(&messages.SpellFail{
		MessageBase:    messages.Base(ts),
		SpellData:      spell,
		Caster:         caster,
		FailedByServer: serverSide,
	})
}

func (p *Parser) slain(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeDeath(ts, m)
}

func (p *Parser) dispel(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	return next.DecodeDispel(p.ctx, p, ts, m)
}

func (p *Parser) loot(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	playerName := m.String()
	rest := m.rest()

	if err := m.Error(); err != nil {
		return nil, err
	}

	var itemID int32
	var itemSuffix int32
	for _, part := range rest {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "Hitem:") {
			part = strings.TrimSpace(strings.TrimPrefix(part, "Hitem:"))
			fields := strings.Split(part, ":")
			if len(fields) != 4 {
				return nil, fmt.Errorf("unexpected item string format: %s", part)
			}

			itemID64, err := strconv.Atoi(fields[0])
			if err != nil {
				return nil, fmt.Errorf("parsing item ID: %w", err)
			}

			itemSuffix64, err := strconv.Atoi(fields[3])
			if err != nil {
				return nil, fmt.Errorf("parsing item suffix: %w", err)
			}
			itemID = int32(itemID64)
			itemSuffix = int32(itemSuffix64)
			break
		}
	}

	itemName := rest[3]
	itemName = strings.Trim(strings.TrimPrefix(itemName, "h"), `[]`)

	last := rest[len(rest)-1]
	quantity := int32(1)
	if strings.HasPrefix(last, "rx") {
		quantity64, err := strconv.Atoi(strings.TrimPrefix(last, "rx"))
		if err != nil {
			return nil, fmt.Errorf("parsing loot quantity %q: %w", last, err)
		}
		quantity = int32(quantity64)
	}

	return set(&messages.Loot{
		MessageBase:  messages.Base(ts),
		PlayerName:   playerName,
		ItemName:     itemName,
		ItemID:       itemID,
		ItemSuffixID: itemSuffix,
		Quantity:     quantity,
	})
}

// 1775356811498|LOOT_TRADE|Jimmythehand trades item Bloodfang Spaulders to Eithinis.
var lootTradeRegex = regexp.MustCompile(`(.+[^\s]) trades item (.+[^\s]) to (.+[^\s])\.`)

func (p *Parser) lootTrade(ctx context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	message := m.String()
	if err := m.Error(); err != nil {
		return nil, err
	}

	matches, ok := types.FromRegex(lootTradeRegex).Match(message)
	if !ok {
		return nil, fmt.Errorf("loot trade regex does not match %q", message)
	}

	from := matches.String()
	itemName := matches.String()
	to := matches.String()

	return set(&messages.LootTrade{
		MessageBase:    messages.Base(ts),
		FromPlayerName: from,
		ToPlayerName:   to,
		ItemName:       itemName,
	})
}

func set(m ...messages.Message) ([]messages.Message, error) {
	return m, nil
}
