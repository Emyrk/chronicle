package vanilla

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// DecodeUnitTarget decodes a hostile unit's current target observation.
func DecodeUnitTarget(ts time.Time, m MetadataFields) ([]messages.Message, error) {
	unit := m.Guid()
	target := m.OptionalGuid()
	if err := requireNoRemainingTelemetryFields("unit target", m); err != nil {
		return nil, err
	}
	return []messages.Message{&messages.UnitTarget{MessageBase: messages.Base(ts), Unit: unit, Target: target}}, nil
}

// DecodeUnitCombat decodes a hostile unit's combat-state observation.
func DecodeUnitCombat(ts time.Time, m MetadataFields) ([]messages.Message, error) {
	unit := m.Guid()
	inCombat := m.Int32()
	if err := requireNoRemainingTelemetryFields("unit combat", m); err != nil {
		return nil, err
	}
	if inCombat != 0 && inCombat != 1 {
		return nil, fmt.Errorf("unit combat: invalid combat state %d", inCombat)
	}
	return []messages.Message{&messages.UnitCombatState{MessageBase: messages.Base(ts), Unit: unit, InCombat: inCombat == 1}}, nil
}

// DecodeRaidMark decodes a raid-target icon assignment. Index zero clears it.
func DecodeRaidMark(ts time.Time, m MetadataFields) ([]messages.Message, error) {
	unit := m.Guid()
	index := m.Int32()
	if err := requireNoRemainingTelemetryFields("raid mark", m); err != nil {
		return nil, err
	}
	if index < 0 || index > 8 {
		return nil, fmt.Errorf("raid mark: invalid index %d", index)
	}
	return []messages.Message{&messages.RaidMark{MessageBase: messages.Base(ts), Unit: unit, Index: uint8(index)}}, nil
}

// DecodeThreat decodes one hostile unit's server-provided threat table.
func DecodeThreat(ts time.Time, m MetadataFields) ([]messages.Message, error) {
	mob := m.OptionalGuid()
	mobName := m.String()
	source := m.String()
	entriesRaw := m.String()
	if err := requireNoRemainingTelemetryFields("threat", m); err != nil {
		return nil, err
	}
	entries, err := parseThreatEntries(entriesRaw)
	if err != nil {
		return nil, fmt.Errorf("threat: %w", err)
	}
	return []messages.Message{&messages.Threat{MessageBase: messages.Base(ts), Mob: mob, MobName: mobName, Source: source, Entries: entries}}, nil
}

// DecodeThreatTank decodes the server's creatures-tanked table for one player.
func DecodeThreatTank(ts time.Time, m MetadataFields) ([]messages.Message, error) {
	source := m.String()
	entriesRaw := m.String()
	if err := requireNoRemainingTelemetryFields("threat tank", m); err != nil {
		return nil, err
	}
	entries, err := parseThreatTankEntries(entriesRaw)
	if err != nil {
		return nil, fmt.Errorf("threat tank: %w", err)
	}
	return []messages.Message{&messages.ThreatTank{MessageBase: messages.Base(ts), Source: source, Entries: entries}}, nil
}

func requireNoRemainingTelemetryFields(event string, m MetadataFields) error {
	if err := m.Error(); err != nil {
		return err
	}
	if m.Remain() != 0 {
		return fmt.Errorf("%s: unexpected extra fields", event)
	}
	return nil
}

func parseThreatEntries(raw string) ([]messages.ThreatEntry, error) {
	entries := splitTelemetryList(raw)
	result := make([]messages.ThreatEntry, 0, len(entries))
	for _, entry := range entries {
		fields := strings.Split(entry, ":")
		if len(fields) != 5 {
			return nil, fmt.Errorf("invalid entry %q: expected 5 fields, got %d", entry, len(fields))
		}
		tank, err := parseBinaryTelemetryFlag("tank", fields[1])
		if err != nil {
			return nil, fmt.Errorf("entry %q: %w", entry, err)
		}
		threat, err := strconv.ParseInt(fields[2], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("entry %q: parse threat: %w", entry, err)
		}
		percentage, err := strconv.ParseFloat(fields[3], 64)
		if err != nil {
			return nil, fmt.Errorf("entry %q: parse percentage: %w", entry, err)
		}
		melee, err := parseBinaryTelemetryFlag("melee", fields[4])
		if err != nil {
			return nil, fmt.Errorf("entry %q: %w", entry, err)
		}
		result = append(result, messages.ThreatEntry{Player: fields[0], Tank: tank, Threat: threat, Percentage: percentage, Melee: melee})
	}
	return result, nil
}

func parseThreatTankEntries(raw string) ([]messages.ThreatTankEntry, error) {
	entries := splitTelemetryList(raw)
	result := make([]messages.ThreatTankEntry, 0, len(entries))
	for _, entry := range entries {
		fields := strings.Split(entry, ":")
		if len(fields) != 4 {
			return nil, fmt.Errorf("invalid entry %q: expected 4 fields, got %d", entry, len(fields))
		}
		percentage, err := strconv.ParseFloat(fields[3], 64)
		if err != nil {
			return nil, fmt.Errorf("entry %q: parse percentage: %w", entry, err)
		}
		result = append(result, messages.ThreatTankEntry{Creature: fields[0], ServerGUID: fields[1], NextPlayer: fields[2], Percentage: percentage})
	}
	return result, nil
}

func splitTelemetryList(raw string) []string {
	raw = strings.TrimSuffix(raw, ";")
	if raw == "" {
		return nil
	}
	return strings.Split(raw, ";")
}

func parseBinaryTelemetryFlag(name, raw string) (bool, error) {
	switch raw {
	case "0":
		return false, nil
	case "1":
		return true, nil
	default:
		return false, fmt.Errorf("invalid %s flag %q", name, raw)
	}
}
