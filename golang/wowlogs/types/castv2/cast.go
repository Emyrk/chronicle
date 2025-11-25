package castv2

import (
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

// CastV2 is the v2 format of a cast log line.
//
// Examples:
// No target:
// 11/18 19:07:21.055  CAST: 0x000000000007D436(Unknown) casts Heavy Silk Bandage(7929).
// 11/18 19:07:21.969  CAST: 0x00000000000E5A2D(Zuggings) begins to cast Heavy Silk Bandage(7929).
// 11/18 19:07:30.945  CAST: 0x0000000000036F89(Xiaoyu) casts Conjure Water(10140)(Rank 7).
// 11/18 07:21:26.254  CAST: Maldrissa fails casting Immolate(1094)(Rank 3).
//
// Target:
// 11/18 19:08:30.447  CAST: 0x000000000001C7AC(Doyd) begins to cast Throw(2764) on 0xF130016738272AB6(Junglepaw Panther).
// 11/18 19:09:00.402  CAST: 0x000000000001C7AC(Doyd) channels First Aid(7927)(Rank 6) on 0x000000000001C7AC(Doyd).
type CastV2 struct {
	Caster types.Unit
	Action types.CastActions
	Target *types.Unit
	Spell  types.Spell
}

func ParseCast(content string) (CastV2, error) {
	trimmed, ok := IsCast(content)
	if !ok {
		return CastV2{}, fmt.Errorf("not a CAST message")
	}

	matched, ok := types.FromRegex(regexs.ReV2CastsRankTarget).Match(trimmed)
	if ok {
		return parseCastWithTarget(matched)
	}

	matched, ok = types.FromRegex(regexs.ReV2Cast).Match(trimmed)
	if ok {
		return parseCastSimple(matched)
	}

	return CastV2{}, fmt.Errorf("CAST failed: %s", content)
}

// parseCastWithTarget is just the simple + target match
// The rest is the same order
func parseCastWithTarget(matched *types.Matched) (CastV2, error) {
	c, err := parseCastSimple(matched)
	if err != nil {
		return CastV2{}, err
	}
	target := matched.Unit()
	c.Target = &target
	return c, matched.Error()
}

func parseCastSimple(matched *types.Matched) (CastV2, error) {
	caster := matched.Unit()
	action := matched.String()
	spell := matched.String()

	act, err := types.ParseCastActions(action)
	if err != nil {
		return CastV2{}, fmt.Errorf("action: %v", err)
	}

	sp, err := types.ParseSpell(spell)
	if err != nil {
		return CastV2{}, fmt.Errorf("spell: %v", err)
	}

	return CastV2{
		Caster: caster,
		Action: act,
		Target: nil,
		Spell:  sp,
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
