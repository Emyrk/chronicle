package v9

import (
	"fmt"
	"hash/fnv"
	"strconv"
	"strings"
)

const (
	legacyObjectHigh   = uint64(0xF110)
	legacyCreatureHigh = uint64(0xF130)
	legacyPetHigh      = uint64(0xF140)
	legacyVehicleHigh  = uint64(0xF150)
)

// guidNormalizer converts Blizzard's modern string GUIDs into Chronicle's
// legacy 64-bit GUID representation. Player GUIDs are lossless. World-object
// GUIDs preserve the entity type and template entry, with a collision-checked
// 24-bit hash of the complete modern GUID as the instance identity.
type guidNormalizer struct {
	seen map[uint64]string
}

func newGUIDNormalizer() *guidNormalizer {
	return &guidNormalizer{seen: make(map[uint64]string)}
}

func hash24(raw string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(raw))
	return h.Sum32() & 0xFFFFFF
}

func (n *guidNormalizer) normalize(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "nil" || raw == "0000000000000000" || raw == "0x0000000000000000" {
		return "0x0000000000000000", nil
	}
	if strings.HasPrefix(raw, "0x") {
		return raw, nil
	}

	parts := strings.Split(raw, "-")
	var value uint64
	switch parts[0] {
	case "Player":
		if len(parts) != 3 {
			return "", fmt.Errorf("invalid player GUID %q", raw)
		}
		server, err := strconv.ParseUint(parts[1], 10, 16)
		if err != nil {
			return "", fmt.Errorf("parse player server in %q: %w", raw, err)
		}
		id, err := strconv.ParseUint(parts[2], 16, 32)
		if err != nil {
			return "", fmt.Errorf("parse player id in %q: %w", raw, err)
		}
		value = server<<32 | id

	case "Creature", "Pet", "Vehicle", "GameObject", "Corpse":
		if len(parts) < 7 {
			return "", fmt.Errorf("invalid world GUID %q", raw)
		}
		entry, err := strconv.ParseUint(parts[len(parts)-2], 10, 24)
		if err != nil {
			return "", fmt.Errorf("parse entry in %q: %w", raw, err)
		}
		if _, err := strconv.ParseUint(parts[len(parts)-1], 16, 40); err != nil {
			return "", fmt.Errorf("parse spawn in %q: %w", raw, err)
		}
		high := legacyCreatureHigh
		switch parts[0] {
		case "Pet":
			high = legacyPetHigh
		case "Vehicle":
			high = legacyVehicleHigh
		case "GameObject":
			high = legacyObjectHigh
		case "Corpse":
			// Corpse GUIDs identify a player's corpse but do not retain the player
			// GUID. Treat them as objects so they cannot be mistaken for players.
			high = legacyObjectHigh
		}
		// A modern world GUID needs more than 64 bits if stored losslessly. Keep
		// Chronicle's 16-bit type and 24-bit template entry, then derive the
		// remaining 24-bit identity from the complete GUID. This distinguishes
		// otherwise identical pets and creatures whose modern spawn IDs differ
		// only above the low 24 bits. The seen map makes collisions fatal.
		value = high<<48 | entry<<24 | uint64(hash24(raw))

	default:
		return "", fmt.Errorf("unsupported Blizzard GUID %q", raw)
	}

	if previous, ok := n.seen[value]; ok && previous != raw {
		return "", fmt.Errorf("blizzard GUID collision: %q and %q normalize to 0x%016X", previous, raw, value)
	}
	n.seen[value] = raw
	return fmt.Sprintf("0x%016X", value), nil
}
