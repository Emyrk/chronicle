package vanillaparser

import (
  "time"

  "github.com/Emyrk/chronicle/golang/wowlogs/metatypes/cast"
)

func OnlyKeepRawV2Casts(ts time.Time, content string) bool {
  _, ok := cast.IsCast(content)
  if !ok {
    return true // Not a cast, ignore this
  }

  c, err := cast.ParseCast(content)
  if err != nil {
    return false
  }

  return c.