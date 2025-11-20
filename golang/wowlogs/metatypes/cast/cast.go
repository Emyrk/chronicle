package cast

import (
  "fmt"
  "strings"
  "time"

  "github.com/Emyrk/chronicle/golang/wowlogs/metatypes"
)

const (
  PrefixCast = "CAST:"
)

func IsCast(content string) (string, bool) {
  return metatypes.Is(PrefixCast, content)
}

type Cast struct {
}

func ParseCast(content string) (Cast, error) {
  trimmed, ok := IsCast(content)
  if !ok {
    return Cast{}, fmt.Errorf("not a CAST message")
  }

}
