package vanilla

import (
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"strconv"
	"strings"
	"time"
)

// LootFields exposes only the field sequence needed for item-link decoding.
type LootFields interface {
	String() string
	Rest() []string
	Error() error
}

func DecodeLoot(ts time.Time, m LootFields) ([]messages.Message, error) {
	playerName := m.String()
	rest := m.Rest()

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

	// Approved malformed-input change: truncated item links used to panic here.
	// Keep prior item-ID/suffix errors and all valid payload interpretation intact.
	if len(rest) < 4 {
		return nil, fmt.Errorf("loot: expected at least 4 item fields, got %d", len(rest))
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

	return decoded(&messages.Loot{
		MessageBase:  messages.Base(ts),
		PlayerName:   playerName,
		ItemName:     itemName,
		ItemID:       itemID,
		ItemSuffixID: itemSuffix,
		Quantity:     quantity,
	})
}
