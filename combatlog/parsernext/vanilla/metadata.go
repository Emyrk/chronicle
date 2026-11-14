package vanilla

import (
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	"github.com/Emyrk/chronicle/internal/ptr"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Capabilities are observed wire features, not inferred identity or header claims.
type Capabilities struct{ RaidGroup, UnitResources, UnitPosition bool }

// MetadataResult preserves observations independently of message emission/error.
// UNIT_STATE may observe resources before later position parsing fails.
type MetadataResult struct {
	Messages []messages.Message
	Observed Capabilities
}
type MetadataFields interface {
	RecordFields
	Remain() int
	OptionalGuid() *guid.GUID
	OptionalUint32() uint32
	Bool() bool
	CSV() []string
}

func DecodeRaidComposition(ts time.Time, m MetadataFields) (MetadataResult, error) {
	observed := Capabilities{}
	reason := m.String()
	memberCount := m.Int32()
	payload := m.String()
	if err := m.Error(); err != nil {
		return MetadataResult{Observed: observed}, err
	}
	if m.Remain() != 0 {
		return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: unexpected extra fields")
	}
	if reason == "" {
		return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: reason is required")
	}
	if memberCount < 0 || memberCount > messages.RaidGroupCount*messages.RaidGroupSize {
		return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: invalid member count %d", memberCount)
	}

	result := &messages.RaidGroup{MessageBase: messages.Base(ts)}
	if memberCount == 0 {
		if payload != "" {
			return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: expected empty payload for zero members")
		}
		observed.RaidGroup = true
		return MetadataResult{Messages: []messages.Message{result}, Observed: observed}, nil
	}

	entries := strings.Split(payload, ";")
	if len(entries) != int(memberCount) {
		return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: expected %d members, got %d", memberCount, len(entries))
	}

	previousIndex := 0
	groupSizes := [messages.RaidGroupCount]int{}
	for i, entry := range entries {
		parts := strings.Split(entry, ",")
		if len(parts) != 4 {
			return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: member %d expected 4 fields, got %d", i+1, len(parts))
		}

		member, err := parseRaidGUID(parts[0])
		if err != nil {
			return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: invalid GUID %q at member %d: %w", parts[0], i+1, err)
		}
		raidIndex, err := strconv.Atoi(parts[1])
		if err != nil || raidIndex < 1 || raidIndex > messages.RaidGroupCount*messages.RaidGroupSize {
			return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: invalid raid index %q at member %d", parts[1], i+1)
		}
		if raidIndex <= previousIndex {
			return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: raid indexes must be strictly ascending")
		}
		subgroup, err := strconv.Atoi(parts[2])
		if err != nil || subgroup < 1 || subgroup > messages.RaidGroupCount {
			return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: invalid subgroup %q at member %d", parts[2], i+1)
		}
		rank, err := strconv.Atoi(parts[3])
		if err != nil || rank < 0 || rank > 2 {
			return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: invalid rank %q at member %d", parts[3], i+1)
		}

		groupIndex := subgroup - 1
		slotIndex := groupSizes[groupIndex]
		if slotIndex >= messages.RaidGroupSize {
			return MetadataResult{Observed: observed}, fmt.Errorf("raid composition: subgroup %d has more than %d members", subgroup, messages.RaidGroupSize)
		}
		result.Groups[groupIndex][slotIndex] = member
		groupSizes[groupIndex]++
		previousIndex = raidIndex
	}

	observed.RaidGroup = true
	return MetadataResult{Messages: []messages.Message{result}, Observed: observed}, nil
}

func DecodeRaidGroup(ts time.Time, m MetadataFields) (MetadataResult, error) {
	observed := Capabilities{}
	fields := strings.Split(m.String(), ",")
	if err := m.Error(); err != nil {
		return MetadataResult{Observed: observed}, err
	}

	expectedFields := messages.RaidGroupCount * messages.RaidGroupSize
	if len(fields) != expectedFields {
		return MetadataResult{Observed: observed}, fmt.Errorf("raid group: expected %d fields, got %d", expectedFields, len(fields))
	}

	result := &messages.RaidGroup{MessageBase: messages.Base(ts)}
	for i, field := range fields {
		if field == "" {
			continue
		}

		member, err := parseRaidGUID(field)
		if err != nil {
			return MetadataResult{Observed: observed}, fmt.Errorf("raid group: invalid GUID %q at field %d: %w", field, i+1, err)
		}
		result.Groups[i/messages.RaidGroupSize][i%messages.RaidGroupSize] = member
	}

	observed.RaidGroup = true
	return MetadataResult{Messages: []messages.Message{result}, Observed: observed}, nil
}

func DecodeUnitState(ts time.Time, m MetadataFields) (MetadataResult, error) {
	observed := Capabilities{}
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
		return MetadataResult{Observed: observed}, err
	}
	if m.Remain() != 0 {
		return MetadataResult{Observed: observed}, fmt.Errorf("unit state: unexpected extra fields")
	}

	currentHealth, hasCurrentHealth, err := parseOptionalInt64("current health", healthRaw)
	if err != nil {
		return MetadataResult{Observed: observed}, err
	}
	maximumHealth, hasMaximumHealth, err := parseOptionalInt64("maximum health", maximumHealthRaw)
	if err != nil {
		return MetadataResult{Observed: observed}, err
	}
	currentPower, _, err := parseOptionalInt32("current power", powerRaw)
	if err != nil {
		return MetadataResult{Observed: observed}, err
	}
	maximumPower, _, err := parseOptionalInt32("maximum power", maximumPowerRaw)
	if err != nil {
		return MetadataResult{Observed: observed}, err
	}
	powerType, hasPowerType, err := parseOptionalInt32("power type", powerTypeRaw)
	if err != nil {
		return MetadataResult{Observed: observed}, err
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
		observed.UnitResources = true
	}

	mapID, _, err := parseOptionalInt32("map ID", mapIDRaw)
	if err != nil {
		return MetadataResult{Observed: observed}, err
	}
	x, hasX, err := parseOptionalFloat64("x", xRaw)
	if err != nil {
		return MetadataResult{Observed: observed}, err
	}
	y, hasY, err := parseOptionalFloat64("y", yRaw)
	if err != nil {
		return MetadataResult{Observed: observed}, err
	}
	z, hasZ, err := parseOptionalFloat64("z", zRaw)
	if err != nil {
		return MetadataResult{Observed: observed}, err
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
		observed.UnitPosition = true
	}

	return MetadataResult{Messages: result, Observed: observed}, nil
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

func DecodeZoneInfo(ts time.Time, m MetadataFields) ([]messages.Message, error) {
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

	return decoded(&messages.Zone{
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

func DecodeUnitInfo(ts time.Time, m MetadataFields) ([]messages.Message, error) {
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

	return decoded(&messages.Unit{
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

func DecodeLootTrade(ts time.Time, m MetadataFields) ([]messages.Message, error) {
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

	return decoded(&messages.LootTrade{
		MessageBase:    messages.Base(ts),
		FromPlayerName: from,
		ToPlayerName:   to,
		ItemName:       itemName,
	})
}

var lootTradeRegex = regexp.MustCompile(`(.+[^\s]) trades item (.+[^\s]) to (.+[^\s])\.`)

func ReadOptionalUint32(m interface {
	String() string
	SetError(error)
}) uint32 {
	v, err := func(s string) (uint32, error) {
		if s == "" || s == "nil" {
			return 0, nil
		}
		u, err := strconv.ParseUint(s, 10, 32)
		if err != nil {
			return 0, err
		}
		return uint32(u), nil
	}(m.String())
	m.SetError(err)
	return v
}
