package companion

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
)

// dispatch routes a fully-assembled companion payload to the appropriate parser.
// The first character of the payload determines the message type.
func (p *Parser) dispatch(ts time.Time, payload string) ([]messages.Message, error) {
	if len(payload) == 0 {
		return nil, fmt.Errorf("empty payload")
	}

	switch payload[0] {
	case 'Z':
		return p.parseZone(ts, payload[1:])
	case 'H':
		return p.parseHeader(ts, payload[1:])
	case 'P':
		return p.parsePlayer(ts, payload[1:])
	case 'L':
		return p.parseLoot(ts, payload[1:])
	case 'M':
		return p.parseMeta(ts, payload[1:])
	default:
		return nil, fmt.Errorf("unknown companion message type %q", string(payload[0]))
	}
}

// parseZone parses: Z:<name>,<instanceType>,<diffIdx>,<diffName>,<maxPlayers>,<dynDiff>,<isDynamic>,<mapID>,<lfgID>,<subZone>
func (p *Parser) parseZone(ts time.Time, data string) ([]messages.Message, error) {
	if len(data) == 0 || data[0] != ':' {
		return nil, fmt.Errorf("zone: missing colon prefix")
	}
	data = data[1:] // strip leading ':'

	// Split on comma. Some fields may be empty (e.g. diffName when none).
	parts := strings.Split(data, ",")
	if len(parts) < 8 {
		return nil, fmt.Errorf("zone: expected at least 8 fields, got %d", len(parts))
	}

	name := parts[0]
	instanceType := parts[1]

	mapID, err := strconv.ParseUint(parts[7], 10, 32)
	if err != nil {
		return nil, fmt.Errorf("zone: invalid mapID %q: %w", parts[7], err)
	}

	// Determine if this is an instance based on instanceType.
	isInstance := instanceType != "none" && instanceType != ""

	z := zone.Zone{
		Seen:         ts,
		Name:         strings.ToLower(name),
		MapID:        uint32(mapID),
		InstanceType: instanceType,
		IsInstance:   isInstance,
	}

	// Parse optional difficulty fields for zone extensions.
	if len(parts) >= 10 {
		z.DifficultyIndex, _ = strconv.Atoi(parts[2])
		z.DifficultyName = parts[3]
		z.MaxPlayers, _ = strconv.Atoi(parts[4])
		z.DynamicDifficulty, _ = strconv.Atoi(parts[5])
		z.SubZone = parts[9]
	}

	return []messages.Message{
		&messages.Zone{
			MessageBase: messages.Base(ts),
			Zone:        z,
		},
	}, nil
}

// ParseHeaderClock parses the optional clock fields from a companion header
// payload without the leading "H:". Legacy six-field headers return nil.
func ParseHeaderClock(data string) (*realmclock.Info, error) {
	parts := strings.Split(data, ",")
	if len(parts) < 8 {
		return nil, nil
	}

	localEpoch, err := strconv.ParseInt(parts[6], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("header: invalid localEpoch %q: %w", parts[6], err)
	}
	utcOffsetMinutes, err := strconv.Atoi(parts[7])
	if err != nil {
		return nil, fmt.Errorf("header: invalid utcOffsetMin %q: %w", parts[7], err)
	}

	info := realmclock.FromUnixOffset(localEpoch, utcOffsetMinutes)
	return &info, nil
}

// parseHeader parses: H:<addonVersion>,<realm>,<locale>,<wowVersion>,<wowBuild>,<sessionId>
func (p *Parser) parseHeader(ts time.Time, data string) ([]messages.Message, error) {
	if len(data) == 0 || data[0] != ':' {
		return nil, fmt.Errorf("header: missing colon prefix")
	}
	data = data[1:]

	parts := strings.Split(data, ",")
	if len(parts) < 6 {
		return nil, fmt.Errorf("header: expected 6 fields, got %d", len(parts))
	}

	clock, err := ParseHeaderClock(data)
	if err != nil {
		return nil, err
	}
	if clock != nil {
		p.realmClock = clock
	}

	addonVersion := parts[0]
	realmName := parts[1]
	// locale := parts[2] // Available but not stored yet
	wowVersion := parts[3]
	wowBuild, _ := strconv.Atoi(parts[4])
	// sessionId := parts[5] // Available but not stored yet

	result := []messages.Message{
		&messages.Realm{
			MessageBase: messages.Base(ts),
			Info: realm.Info{
				Seen:      ts,
				RealmName: realmName,
				Version:   wowVersion,
				Build:     wowBuild,
			},
		},
		&messages.Versions{
			MessageBase: messages.Base(ts),
			Versions: map[string]string{
				"addon":                     addonVersion,
				"chronicle_companion_wotlk": addonVersion,
				"wow":                       wowVersion,
			},
		},
	}

	return result, nil
}

// parseLoot parses: L<kind>,<quality>,<itemId>,<count>,<player>
// kind: L=loot, T=trade. For trades, player is "Giver>Receiver".
func (p *Parser) parseLoot(ts time.Time, data string) ([]messages.Message, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("loot: empty data")
	}

	// First char is the kind (L or T), followed by a comma, then the remaining fields.
	kind := data[0]
	if kind != 'L' && kind != 'T' {
		return nil, fmt.Errorf("loot: unknown kind %q", string(kind))
	}
	if len(data) < 2 || data[1] != ',' {
		return nil, fmt.Errorf("loot: expected comma after kind")
	}

	parts := strings.SplitN(data[2:], ",", 4)
	if len(parts) < 4 {
		return nil, fmt.Errorf("loot: expected 4 fields after kind, got %d", len(parts))
	}

	// parts[0] is quality — skipped, the frontend fetches it separately.
	itemID, err := strconv.ParseInt(parts[1], 10, 32)
	if err != nil {
		return nil, fmt.Errorf("loot: invalid itemId %q: %w", parts[1], err)
	}
	count, err := strconv.ParseInt(parts[2], 10, 32)
	if err != nil {
		return nil, fmt.Errorf("loot: invalid count %q: %w", parts[2], err)
	}
	player := parts[3]

	if kind == 'T' {
		// Trade: player field is "Giver>Receiver"
		tradeParts := strings.SplitN(player, ">", 2)
		if len(tradeParts) != 2 {
			return nil, fmt.Errorf("loot trade: expected Giver>Receiver, got %q", player)
		}
		return []messages.Message{
			&messages.LootTrade{
				MessageBase:    messages.Base(ts),
				FromPlayerName: tradeParts[0],
				ToPlayerName:   tradeParts[1],
				ItemID:         int32(itemID),
			},
		}, nil
	}

	return []messages.Message{
		&messages.Loot{
			MessageBase: messages.Base(ts),
			PlayerName:  player,
			ItemID:      int32(itemID),
			Quantity:    int32(count),
		},
	}, nil
}

// parseMeta parses: M<dirty>,<landed_0>,<landed_1>,...,<landed_9>
// Returns a CompanionStats message with dirty count and per-minute-bucket landed counts.
func (p *Parser) parseMeta(ts time.Time, data string) ([]messages.Message, error) {
	parts := strings.Split(data, ",")
	if len(parts) < 1 {
		return nil, fmt.Errorf("meta: empty data")
	}
	var stats messages.CompanionStats
	stats.MessageBase = messages.Base(ts)
	stats.Dirty, _ = strconv.Atoi(parts[0])
	for i := 1; i < len(parts) && i <= 10; i++ {
		stats.Buckets[i-1], _ = strconv.Atoi(parts[i])
	}
	return []messages.Message{&stats}, nil
}
