package cast

import (
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/golang/wowlogs/metatypes"
	"github.com/Emyrk/chronicle/golang/wowlogs/regexs"
)

const (
	PrefixCast = "CAST:"
)

func IsCast(content string) (string, bool) {
	return metatypes.Is(PrefixCast, content)
}

type Cast struct {
	metatypes.Unit
}

func ParseCast(content string) (Cast, error) {
	trimmed, ok := IsCast(content)
	if !ok {
		return Cast{}, fmt.Errorf("not a CAST message")
	}

	matched, ok := regexs.FromRegex(regexs.ReV2CastsRankTarget).Match(content)
	if ok {
		return parseCastWithTarget(matched)
	}

	matched, ok = regexs.FromRegex(regexs.ReV2Cast).Match(trimmed)
	if ok {
		return parseCastSimple(matched)
	}

	return Cast{}, errors.New("regexes did not match for cast")
}

func parseCastWithTarget(matched regexs.Matched) (Cast, error) {
	caster := matched.String()
	phrase := matched.String()
	spell := matched.String()
	target := matched.String()

	return Cast{}, nil
}

func parseCastSimple(matched regexs.Matched) (Cast, error) {
	return Cast{}, nil
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
