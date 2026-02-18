package types2proto

import (
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/slice"
)

func Damage(from time.Time, idx int32, dmg messages.Damage) *chronicleproto.Damage {
	return &chronicleproto.Damage{
		Meta: &chronicleproto.EventMeta{
			Index:       idx,
			OffsetMilli: dmg.Timestamp.UnixMilli() - from.UnixMilli(),
		},
		Caster:     OptionalGUID(dmg.Caster),
		SourceName: dmg.SourceName(),
		Target:     dmg.Target.String(),
		HitType:    HitType(dmg.HitType),
		Amount:     dmg.Amount,
		School:     School(dmg.School),
		Tailers:    slice.List(dmg.Trailer, TrailerEntry),
	}
}

func Heal(from time.Time, idx int32, heal messages.Heal) *chronicleproto.Heal {
	return &chronicleproto.Heal{
		Meta: &chronicleproto.EventMeta{
			Index:       idx,
			OffsetMilli: heal.Timestamp.UnixMilli() - from.UnixMilli(),
		},
		Caster:     heal.Caster.String(),
		Target:     heal.Target.String(),
		SourceName: heal.SpellName,
		Amount:     heal.Amount,
		HitType:    HitType(heal.HitType),
	}
}

func ResourceChange(from time.Time, idx int32, rc messages.ResourceChange) *chronicleproto.ResourceChange {
	return &chronicleproto.ResourceChange{
		Meta: &chronicleproto.EventMeta{
			Index:       idx,
			OffsetMilli: rc.Timestamp.UnixMilli() - from.UnixMilli(),
		},
		Target:       rc.Target.String(),
		Amount:       rc.Amount,
		ResourceType: rc.Resource.String(),
		Caster:       OptionalGUID(rc.Caster),
		SourceName:   rc.SpellName,
		Direction:    rc.Direction.String(),
	}
}

func ExtraAttack(from time.Time, idx int32, ea messages.ExtraAttack) *chronicleproto.ExtraAttack {
	return &chronicleproto.ExtraAttack{
		Meta: &chronicleproto.EventMeta{
			Index:       idx,
			OffsetMilli: ea.Timestamp.UnixMilli() - from.UnixMilli(),
		},
		Amount:     ea.Amount,
		Target:     ea.Caster.String(), // Extra attacks are granted to the caster
		SourceName: ea.FromSpellName,
	}
}

func Slain(from time.Time, idx int32, ea messages.Slain) *chronicleproto.Slain {
	var att *chronicleproto.Damage
	if ea.Attribution != nil {
		switch typed := ea.Attribution.(type) {
		case *messages.Damage:
			att = Damage(ea.Attribution.Date(), -1, *typed)
		default:
			// unexpected type
		}
	}
	return &chronicleproto.Slain{
		Meta: &chronicleproto.EventMeta{
			Index:       idx,
			OffsetMilli: ea.Timestamp.UnixMilli() - from.UnixMilli(),
		},
		Target:      ea.Victim.String(),
		Caster:      OptionalGUID(ea.Killer),
		Attribution: att,
	}
}

func Cast(from time.Time, idx int32, ca messages.Cast) *chronicleproto.Cast {
	var target *string
	if ca.Target != nil {
		target = ptr.Ref(ca.Target.Gid.String())
	}
	return &chronicleproto.Cast{
		Meta: &chronicleproto.EventMeta{
			Index:       idx,
			OffsetMilli: ca.Timestamp.UnixMilli() - from.UnixMilli(),
		},
		Caster: ca.Caster.Gid.String(),
		Action: CastAction(ca.Action),
		Target: target,
		Spell:  Spell(ca.Spell),
	}
}

func Aura(from time.Time, idx int32, a messages.Aura) *chronicleproto.Aura {
	{
		return &chronicleproto.Aura{
			Meta: &chronicleproto.EventMeta{
				Index:       idx,
				OffsetMilli: a.Timestamp.UnixMilli() - from.UnixMilli(),
			},
			Target:      a.Target.String(),
			SpellName:   a.SpellName,
			Amount:      a.Amount,
			Application: Application(a.Application),
		}
	}
}

func Spell(spell types.Spell) *chronicleproto.Spell {
	var rank *int32
	if spell.Rank != nil {
		//nolint:gosec
		rank = ptr.Ref(int32(*spell.Rank))
	}
	return &chronicleproto.Spell{
		Name: spell.Name,
		//nolint:gosec
		Id:   int32(spell.ID),
		Rank: rank,
	}
}

func Application(app types.AuraApplication) chronicleproto.AuraApplication {
	switch app {
	case types.AuraApplicationRemoved:
		return chronicleproto.AuraApplication_ApplicationRemoved
	case types.AuraApplicationGains:
		return chronicleproto.AuraApplication_ApplicationGains
	case types.AuraApplicationFades:
		return chronicleproto.AuraApplication_ApplicationFades
	default:
		return chronicleproto.AuraApplication_ApplicationUnknown
	}
}

func CastAction(action types.CastActions) chronicleproto.CastAction {
	switch action {
	case types.CastActionsCasts:
		return chronicleproto.CastAction_ActionCasts
	case types.CastActionsFailsCasting:
		return chronicleproto.CastAction_ActionFailsCasting
	case types.CastActionsBeginsToCast:
		return chronicleproto.CastAction_ActionBeginsToCast
	case types.CastActionsChannels:
		return chronicleproto.CastAction_ActionChannels
	default:
		return chronicleproto.CastAction_ActionUnknown
	}
}

func OptionalGUID(id *guid.GUID) *string {
	if id == nil {
		return nil
	}
	str := id.String()
	return &str
}

func TrailerEntry(t types.TrailerEntry) *chronicleproto.Tailer {
	return &chronicleproto.Tailer{
		Amount:  t.Amount,
		HitType: HitType(t.HitType),
	}
}

func HitType(hitType types.HitType) uint32 {
	return uint32(hitType)
}

func School(school types.School) chronicleproto.School {
	switch school {
	case types.NoneSchool:
		return chronicleproto.School_None
	case types.PhysicalSchool:
		return chronicleproto.School_Physical
	case types.HolySchool:
		return chronicleproto.School_Holy
	case types.FireSchool:
		return chronicleproto.School_Fire
	case types.NatureSchool:
		return chronicleproto.School_Nature
	case types.FrostSchool:
		return chronicleproto.School_Frost
	case types.ShadowSchool:
		return chronicleproto.School_Shadow
	case types.ArcaneSchool:
		return chronicleproto.School_Arcane
	default:
		return chronicleproto.School_Unknown
	}
}
