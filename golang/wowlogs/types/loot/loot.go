package loot

import (
  "fmt"
  "strings"
  "time"

  "github.com/Emyrk/chronicle/golang/wowlogs/types"
)

const (
  PrefixLoot = "LOOT:"
)

func IsLoot(content string) (string, bool) {
  return types.Is(PrefixLoot, content)
}

type Loot struct {
  Seen time.Time
  // TODO: Parse the rest
}

func ParseLootInfo(content string) (Loot, error) {
  trimmed, ok := IsLoot(content)
  if !ok {
    return Loot{}, fmt.Errorf("not a LOOT message")
  }

  parts := strings.Split(trimmed, "&")

  if len(parts) < 2 {
    return Loot{}, fmt.Errorf("insufficient arguments in LOOT message, got %d, want at least 2", len(parts))
  }

  ts, _ := parts[0], parts[1]
  seen, err := time.Parse(types.DateFormat, ts)
  if err != nil {
    return Loot{}, fmt.Errorf("invalid date format %q: %w", ts, err)
  }

  return Loot{
    Seen: seen,
  }, nil
}
