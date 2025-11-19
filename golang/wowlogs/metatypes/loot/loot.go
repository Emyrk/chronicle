package loot

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/metatypes"
)

const (
	PrefixLoot = "LOOT:"
)

type Loot struct {
	Seen time.Time
	// TODO: Parse the rest
}

func ParseLootInfo(content string) (Loot, error) {
	if !strings.HasPrefix(content, PrefixLoot) {
		return Loot{}, nil
	}

	trimmed := strings.TrimPrefix(content, PrefixLoot+" ")
	parts := strings.Split(trimmed, "&")

	if len(parts) < 2 {
		return Loot{}, fmt.Errorf("insufficient arguments in LOOT message, got %d, want at least 2", len(parts))
	}

	ts, _ := parts[0], parts[1]
	seen, err := time.Parse(metatypes.DateFormat, ts)
	if err != nil {
		return Loot{}, fmt.Errorf("invalid date format %q: %w", ts, err)
	}

	return Loot{
		Seen: seen,
	}, nil
}
