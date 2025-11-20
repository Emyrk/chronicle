package cast

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/metatypes"
	"github.com/Emyrk/chronicle/golang/wowlogs/metatypes/consumer"
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

	var err error
	unit := metatypes.Unit{}

	cns := consumer.New(trimmed)
	if cns.Peek(2) == "0x" {
		gidStr := cns.Next(18)
		cns.Next(1) // The '('
		name := cns.NextUntil(')')
		unit.Gid, err = guid.FromString(gidStr)
		if err != nil {
			return Cast{}, fmt.Errorf("invalid GUID in CAST: %w", err)
		}
		unit.Name = name
	}

	// First thing is always the name. If it starts with `0x`, we are in the raw mode
	if strings.HasPrefix(trimmed, "0x") {
		// Raw mode
		trimmed = trimmed[:18]
	}
}

func unit(s string) (metatypes.Unit, string, error) {
	cns := consumer.New(s)
	gidStr := cns.Next(18)
	cns.Next(1) // The '('
	name := cns.NextUntil(')')
	gid, err := guid.FromString(gidStr)
	if err != nil {
		return metatypes.Unit{}, "", fmt.Errorf("invalid GUID in unit: %w", err)
	}
	return metatypes.Unit{
		Name: name,
		Gid:  gid,
	}, cns.Rest(), cns.Err()
}

func rawUnit(s string) (metatypes.Unit, string, error) {
	cns := consumer.New(s)
	gidStr := cns.Next(18)
	cns.Next(1) // The '('
	name := cns.NextUntil(')')
	gid, err := guid.FromString(gidStr)
	if err != nil {
		return metatypes.Unit{}, "", fmt.Errorf("invalid GUID in unit: %w", err)
	}
	return metatypes.Unit{
		Name: name,
		Gid:  gid,
	}, cns.Rest(), cns.Err()
}

// Cast v2 formats -- Raw has GUID(name)
//                                   unit casts
//local fmt_with_rank_target = "CAST: %s %s %s(%s)(%s) on %s."
//local fmt_with_rank = "CAST: %s %s %s(%s)(%s)."
//local fmt_with_target = "CAST: %s %s %s(%s) on %s."
//local fmt_simple = "CAST: %s %s %s(%s)."

//local fmt_raw_with_rank_target = "CAST: %s(%s) %s %s(%s)(%s) on %s(%s)."
//local fmt_raw_with_rank = "CAST: %s(%s) %s %s(%s)(%s)."
//local fmt_raw_with_target = "CAST: %s(%s) %s %s(%s) on %s(%s)."
//local fmt_raw_simple = "CAST: %s(%s) %s %s(%s)."

var (
	unitRaw = regexp.MustCompile(`(0x[0-9A-F]+)\((.+[^\s])\)`)
	// spell can be Ghost Wolf(2645) or Shadow Bolt(1088)(Rank 4)
	ReV2CastsRankTarget = regexp.MustCompile(`(.+[^\s]) (casts|begins to cast) `)
)
