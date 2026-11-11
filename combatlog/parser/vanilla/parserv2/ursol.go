package parserv2

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

func (p *Parser) unitTarget(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	unit := m.Guid()
	target := m.OptionalGuid()
	if err := requireNoRemainingFields("unit target", m); err != nil {
		return nil, err
	}

	return set(&messages.UnitTarget{
		MessageBase: messages.Base(ts),
		Unit:        unit,
		Target:      target,
	})
}

func (p *Parser) unitCombat(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	unit := m.Guid()
	inCombat := m.Int32()
	if err := requireNoRemainingFields("unit combat", m); err != nil {
		return nil, err
	}
	if inCombat != 0 && inCombat != 1 {
		return nil, fmt.Errorf("unit combat: invalid combat state %d", inCombat)
	}

	return set(&messages.UnitCombatState{
		MessageBase: messages.Base(ts),
		Unit:        unit,
		InCombat:    inCombat == 1,
	})
}

func (p *Parser) raidMark(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	unit := m.Guid()
	index := m.Int32()
	if err := requireNoRemainingFields("raid mark", m); err != nil {
		return nil, err
	}
	if index < 0 || index > 8 {
		return nil, fmt.Errorf("raid mark: invalid index %d", index)
	}

	return set(&messages.RaidMark{
		MessageBase: messages.Base(ts),
		Unit:        unit,
		Index:       uint8(index),
	})
}

func (p *Parser) threat(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	mob := m.OptionalGuid()
	mobName := m.String()
	source := m.String()
	entriesRaw := m.String()
	if err := requireNoRemainingFields("threat", m); err != nil {
		return nil, err
	}

	entries, err := parseThreatEntries(entriesRaw)
	if err != nil {
		return nil, fmt.Errorf("threat: %w", err)
	}
	return set(&messages.Threat{
		MessageBase: messages.Base(ts),
		Mob:         mob,
		MobName:     mobName,
		Source:      source,
		Entries:     entries,
	})
}

func (p *Parser) threatTank(_ context.Context, ts time.Time, m *Matched) ([]messages.Message, error) {
	source := m.String()
	entriesRaw := m.String()
	if err := requireNoRemainingFields("threat tank", m); err != nil {
		return nil, err
	}

	entries, err := parseThreatTankEntries(entriesRaw)
	if err != nil {
		return nil, fmt.Errorf("threat tank: %w", err)
	}
	return set(&messages.ThreatTank{
		MessageBase: messages.Base(ts),
		Source:      source,
		Entries:     entries,
	})
}

func requireNoRemainingFields(event string, m *Matched) error {
	if err := m.Error(); err != nil {
		return err
	}
	if m.Remain() != 0 {
		return fmt.Errorf("%s: unexpected extra fields", event)
	}
	return nil
}

func parseThreatEntries(raw string) ([]messages.ThreatEntry, error) {
	entries := splitList(raw)
	result := make([]messages.ThreatEntry, 0, len(entries))
	for _, entry := range entries {
		fields := strings.Split(entry, ":")
		if len(fields) != 5 {
			return nil, fmt.Errorf("invalid entry %q: expected 5 fields, got %d", entry, len(fields))
		}
		tank, err := parseBinaryFlag("tank", fields[1])
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
		melee, err := parseBinaryFlag("melee", fields[4])
		if err != nil {
			return nil, fmt.Errorf("entry %q: %w", entry, err)
		}
		result = append(result, messages.ThreatEntry{
			Player:     fields[0],
			Tank:       tank,
			Threat:     threat,
			Percentage: percentage,
			Melee:      melee,
		})
	}
	return result, nil
}

func parseThreatTankEntries(raw string) ([]messages.ThreatTankEntry, error) {
	entries := splitList(raw)
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
		result = append(result, messages.ThreatTankEntry{
			Creature:   fields[0],
			ServerGUID: fields[1],
			NextPlayer: fields[2],
			Percentage: percentage,
		})
	}
	return result, nil
}

func splitList(raw string) []string {
	raw = strings.TrimSuffix(raw, ";")
	if raw == "" {
		return nil
	}
	return strings.Split(raw, ";")
}

func parseBinaryFlag(name, raw string) (bool, error) {
	switch raw {
	case "0":
		return false, nil
	case "1":
		return true, nil
	default:
		return false, fmt.Errorf("invalid %s flag %q", name, raw)
	}
}
