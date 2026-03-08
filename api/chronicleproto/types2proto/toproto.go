package types2proto

import (
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/slice"
)

// EventMeta creates an EventMeta proto from a message, including activity data.
func EventMeta(from time.Time, idx int32, msg messages.Message) *chronicleproto.EventMeta {
	meta := &chronicleproto.EventMeta{
		Index:       idx,
		OffsetMilli: msg.Date().UnixMilli() - from.UnixMilli(),
	}
	for gid, actType := range msg.Activity() {
		meta.Activity = append(meta.Activity, &chronicleproto.ActivityEntry{
			Guid:      gid.String(),
			EventType: string(actType),
		})
	}
	return meta
}

func SpellData(spell *chrondbc.Spell) *chronicleproto.SpellData {
	if spell == nil {
		return nil
	}
	return &chronicleproto.SpellData{
		Id:            int32(spell.ID),
		Name:          spell.Name(),
		AttackOutcome: uint32(spell.AttackOutcome()),
	}
}

func Damage(from time.Time, idx int32, dmg *messages.Damage) *chronicleproto.Damage {
	return &chronicleproto.Damage{
		Meta:       EventMeta(from, idx, dmg),
		Caster:     OptionalGUID(dmg.Caster),
		SourceName: dmg.SourceName(),
		Target:     dmg.Target.String(),
		HitType:    HitType(dmg.HitType),
		Amount:     dmg.Amount,
		School:     School(dmg.School),
		Tailers:    slice.List(dmg.Trailer, TrailerEntry),
		SpellData:  SpellData(dmg.SpellData),
	}
}

func Heal(from time.Time, idx int32, heal *messages.Heal) *chronicleproto.Heal {
	return &chronicleproto.Heal{
		Meta:       EventMeta(from, idx, heal),
		Caster:     heal.Caster.String(),
		Target:     heal.Target.String(),
		SourceName: heal.SpellName,
		Amount:     heal.Amount,
		HitType:    HitType(heal.HitType),
		SpellData:  SpellData(heal.SpellData),
		School:     School(heal.School),
	}
}

func ResourceChange(from time.Time, idx int32, rc *messages.ResourceChange) *chronicleproto.ResourceChange {
	return &chronicleproto.ResourceChange{
		Meta:         EventMeta(from, idx, rc),
		Target:       rc.Target.String(),
		Amount:       rc.Amount,
		ResourceType: rc.Resource.String(),
		Caster:       OptionalGUID(rc.Caster),
		SourceName:   rc.SpellName,
		Direction:    rc.Direction.String(),
		SpellData:    SpellData(rc.SpellData),
	}
}

func ExtraAttack(from time.Time, idx int32, ea *messages.ExtraAttack) *chronicleproto.ExtraAttack {
	return &chronicleproto.ExtraAttack{
		Meta:       EventMeta(from, idx, ea),
		Target:     ea.Caster.String(), // Extra attacks are granted to the caster
		Amount:     ea.Amount,
		SourceName: ea.FromSpellName,
		SpellData:  SpellData(ea.Spell),
	}
}

func Slain(from time.Time, idx int32, ea *messages.Slain) *chronicleproto.Slain {
	var att *chronicleproto.Damage
	if ea.Attribution != nil {
		switch typed := ea.Attribution.(type) {
		case *messages.Damage:
			if typed != nil {
				att = Damage(typed.Date(), -1, typed)
			}
		default:
			// unexpected type
		}
	}
	return &chronicleproto.Slain{
		Meta:        EventMeta(from, idx, ea),
		Target:      ea.Victim.String(),
		Caster:      OptionalGUID(ea.Killer),
		Attribution: att,
	}
}

func SpellGo(from time.Time, idx int32, ca *messages.SpellGo) *chronicleproto.SpellGo {
	var target *string
	if ca.Target != nil {
		target = ptr.Ref(ca.Target.String())
	}
	var corpseOwner *string
	if ca.CorpseOwner != nil {
		corpseOwner = ptr.Ref(ca.CorpseOwner.String())
	}

	return &chronicleproto.SpellGo{
		Meta:        EventMeta(from, idx, ca),
		ItemID:      ca.ItemID,
		SpellData:   SpellData(ca.SpellData),
		Caster:      ca.Caster.String(),
		Target:      target,
		NumHits:     ca.NumTargetsHit,
		NumMisses:   ca.NumTargetsMissed,
		CorpseOwner: corpseOwner,
	}
}

func Cast(from time.Time, idx int32, ca *messages.Cast) *chronicleproto.Cast {
	var target *string
	if ca.Target != nil {
		target = ptr.Ref(ca.Target.Gid.String())
	}
	return &chronicleproto.Cast{
		Meta:   EventMeta(from, idx, ca),
		Caster: ca.Caster.Gid.String(),
		Action: CastAction(ca.Action),
		Target: target,
		Spell:  Spell(ca.Spell),
	}
}

func Aura(from time.Time, idx int32, a *messages.Aura) *chronicleproto.Aura {
	return &chronicleproto.Aura{
		Meta:          EventMeta(from, idx, a),
		Target:        a.Target.String(),
		SpellName:     a.SpellName,
		CurrentAmount: a.Amount,
		Application:   Application(a.Application),
		State:         AuraState(a.State),
		SpellData:     SpellData(a.SpellData),
		IsBuff:        a.IsBuff,
	}
}

func AuraCast(from time.Time, idx int32, a *messages.AuraCast) *chronicleproto.AuraCast {
	var target *string
	if a.Target != nil {
		target = ptr.Ref(a.Target.String())
	}

	return &chronicleproto.AuraCast{
		Meta:            EventMeta(from, idx, a),
		Spell:           SpellData(a.Spell),
		Caster:          a.Caster.String(),
		Target:          target,
		Effect:          int32(a.Effect),
		Amplitude:       a.Amplitude,
		EffectAuraName:  int32(a.EffectAuraName),
		DurationMS:      a.DurationMS,
		CapStatus:       a.AuraCapStatus,
		EffectMiscValue: a.EffectMiscValue,
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

func AuraState(app types.AuraState) chronicleproto.AuraState {
	switch app {
	case types.AuraStateModified:
		return chronicleproto.AuraState_StateModified
	case types.AuraStateRemoved:
		return chronicleproto.AuraState_StateRemoved
	case types.AuraStateAdded:
		return chronicleproto.AuraState_StateAdded
	default:
		return chronicleproto.AuraState_StateUnknown
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
