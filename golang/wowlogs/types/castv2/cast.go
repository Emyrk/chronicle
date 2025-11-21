package castv2

import (
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/golang/wowlogs/regexs"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
)

const (
	PrefixCast = "CAST:"
)

func IsCast(content string) (string, bool) {
	return types.Is(PrefixCast, content)
}

type CastV2 struct {
	Caster types.Unit
	Action types.CastActions
	Target *types.Unit
}

func ParseCast(content string) (CastV2, error) {
	trimmed, ok := IsCast(content)
	if !ok {
		return CastV2{}, fmt.Errorf("not a CAST message")
	}

	matched, ok := regexs.FromRegex(regexs.ReV2CastsRankTarget).Match(trimmed)
	if ok {
		return parseCastWithTarget(matched)
	}

	matched, ok = regexs.FromRegex(regexs.ReV2Cast).Match(trimmed)
	if ok {
		return parseCastSimple(matched)
	}

	return CastV2{}, errors.New("regexes did not match for cast")
}

func parseCastWithTarget(matched *regexs.Matched) (CastV2, error) {
	caster := matched.Unit()
	action := matched.String()
	spell := matched.String()
	target := matched.Unit()

	c, err := types.ParseCastActions(action)
	if err != nil {
		return CastV2{}, fmt.Errorf("parse: %v", err)
	}

	var _ = spell

	return CastV2{
		Caster: caster,
		Action: c,
		Target: &target,
	}, matched.Error()
}

func parseCastSimple(matched *regexs.Matched) (CastV2, error) {
	caster := matched.Unit()
	phrase := matched.String()
	spell := matched.String()

	var _, _ = phrase, spell

	return CastV2{
		Caster: caster,
	}, matched.Error()
}

func (c CastV2) HasGUIDs() bool {
	return !c.Caster.Gid.IsZero() && (c.Target == nil || !c.Target.Gid.IsZero())
}

// CastV2 v2 formats -- Raw has GUID(name)
//                                   unit casts
//local fmt_with_rank_target = "CAST: %s %s %s(%s)(%s) on %s."
//local fmt_with_rank = "CAST: %s %s %s(%s)(%s)."
//local fmt_with_target = "CAST: %s %s %s(%s) on %s."
//local fmt_simple = "CAST: %s %s %s(%s)."

//local fmt_raw_with_rank_target = "CAST: %s(%s) %s %s(%s)(%s) on %s(%s)."
//local fmt_raw_with_rank = "CAST: %s(%s) %s %s(%s)(%s)."
//local fmt_raw_with_target = "CAST: %s(%s) %s %s(%s) on %s(%s)."
//local fmt_raw_simple = "CAST: %s(%s) %s %s(%s)."
