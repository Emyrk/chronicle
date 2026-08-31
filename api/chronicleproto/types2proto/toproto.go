package types2proto

import (
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/slice"
)

// EventMeta creates an EventMeta proto from a message, including activity data.
func EventMeta(from time.Time, idx int32, msg messages.Message) *chronicleproto.EventMeta {
	meta := &chronicleproto.EventMeta{
		Index:       idx,
		OffsetMilli: msg.Date().UnixMilli() - from.UnixMilli(),
		IsSynthetic: msg.IsSynthetic(),
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
		School:     schoolWithFallback(dmg.School, dmg.SpellData),
		Tailers:    slice.List(dmg.Trailer, TrailerEntry),
		SpellData:  SpellData(dmg.SpellData),
		Overkill:   dmg.Overkill,
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
		School:     schoolWithFallback(heal.School, heal.SpellData),
		Overheal:   heal.Overheal,
		Absorbed:   heal.Absorbed,
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
		OverResource: rc.OverResource,
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

func Resurrection(from time.Time, idx int32, resurrection *messages.Resurrection) *chronicleproto.Resurrection {
	return &chronicleproto.Resurrection{
		Meta:   EventMeta(from, idx, resurrection),
		Source: resurrection.Source.String(),
		Target: resurrection.Target.String(),
		Spell:  SpellData(resurrection.Spell),
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

func SpellStart(from time.Time, idx int32, ca *messages.SpellStart) *chronicleproto.SpellStart {
	var target *string
	if ca.Target != nil {
		target = ptr.Ref(ca.Target.String())
	}

	return &chronicleproto.SpellStart{
		Meta:             EventMeta(from, idx, ca),
		ItemID:           ca.ItemID,
		SpellData:        SpellData(ca.SpellData),
		Caster:           ca.Caster.String(),
		Target:           target,
		CastFlags:        int32(ca.Flags),
		CastTimeMilli:    int32(ca.CastTime.Milliseconds()),
		ChannelTimeMilli: int32(ca.ChannelDuration.Milliseconds()),
		SpellType:        ca.SpellType,
	}
}

func SpellFail(from time.Time, idx int32, ca *messages.SpellFail) *chronicleproto.SpellFail {
	return &chronicleproto.SpellFail{
		Meta:          EventMeta(from, idx, ca),
		Caster:        ca.Caster.String(),
		SpellData:     SpellData(ca.SpellData),
		FailedBySever: ca.FailedByServer,
	}
}

// nolint: staticcheck
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

func UnitClassification(from time.Time, idx int32, msg *messages.UnitClassificationEvent) *chronicleproto.UnitClassification {
	uc := &chronicleproto.UnitClassification{
		Meta:        EventMeta(from, idx, msg),
		Target:      msg.Target.String(),
		UnitType:    int32(msg.UnitType),
		Affiliation: int32(msg.Affiliation),
	}
	if msg.Spell != nil {
		uc.SpellId = int32(msg.Spell.ID)
	}
	if msg.Owner != nil {
		s := msg.Owner.String()
		uc.Owner = &s
	}
	if msg.Controller != nil {
		s := msg.Controller.String()
		uc.Controller = &s
	}
	return uc
}

func CombatantInfo(from time.Time, idx int32, msg *messages.Combatant) *chronicleproto.CombatantInfo {
	ci := &chronicleproto.CombatantInfo{
		Meta:      EventMeta(from, idx, msg),
		Guid:      msg.Guid.String(),
		Name:      msg.Name,
		HeroClass: string(msg.HeroClass),
		Race:      string(msg.Race),
		Gender:    int32(msg.Gender),
	}
	if msg.Guild != nil {
		ci.GuildName = &msg.Guild.Name
	}
	for _, g := range msg.GearSetups {
		ci.Gear = append(ci.Gear, GearSlot(g))
	}
	if msg.Talents != nil {
		ci.Talents = TalentSummary(msg.Talents)
	}
	return ci
}

func GearSlot(g combatant.GearItem) *chronicleproto.CombatantGearSlot {
	slot := &chronicleproto.CombatantGearSlot{
		//nolint:gosec
		ItemId: int32(g.ItemID),
	}
	if g.EnchantID != nil {
		//nolint:gosec
		slot.EnchantId = ptr.Ref(int32(*g.EnchantID))
	}
	if g.GemEnchantIDs != [4]int{} {
		slot.GemEnchantIds = make([]int32, len(g.GemEnchantIDs))
		for i, gemID := range g.GemEnchantIDs {
			//nolint:gosec
			slot.GemEnchantIds[i] = int32(gemID)
		}
	}
	return slot
}

func TalentSummary(t *combatant.Talents) *chronicleproto.CombatantTalents {
	trees := make([]string, 3)
	for i, tree := range t.Trees {
		ranks := make([]byte, len(tree))
		for j, r := range tree {
			ranks[j] = '0' + r
		}
		trees[i] = string(ranks)
	}
	return &chronicleproto.CombatantTalents{
		Summary: []int32{int32(t.Summary[0]), int32(t.Summary[1]), int32(t.Summary[2])},
		Trees:   trees,
	}
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

// schoolWithFallback keeps the combat log's parsed school as authoritative, but
// backfills from the resolved DBC spell when the log omitted the school
// (types.NoneSchool). Some log formats (e.g. certain Turtle SPELL_DMG lines)
// leave the school field empty; without this, downstream consumers such as
// vulnerability-effect filtering and resist analysis would see the wrong school.
// spell may be nil (melee, or parsers that don't attach spell data), in which
// case the parsed value is used as-is.
func schoolWithFallback(parsed types.School, spell *chrondbc.Spell) chronicleproto.School {
	if parsed == types.NoneSchool && spell != nil {
		parsed = spell.School.ToType()
	}
	return School(parsed)
}

func Dispel(from time.Time, idx int32, d *messages.Dispel) *chronicleproto.Dispel {
	var dt chronicleproto.DispelType
	if d.Spell != nil {
		dt = DispelTypeConv(d.Spell.DispelType)
	}
	return &chronicleproto.Dispel{
		Meta:       EventMeta(from, idx, d),
		Caster:     d.Caster.String(),
		Target:     d.Target.String(),
		SpellData:  SpellData(d.Spell),
		DispelType: dt,
	}
}

func Interrupt(from time.Time, idx int32, i *messages.Interrupt) *chronicleproto.Interrupt {
	return &chronicleproto.Interrupt{
		Meta:         EventMeta(from, idx, i),
		Caster:       i.Caster.String(),
		Target:       i.Target.String(),
		SpellName:    i.SpellName,
		ExtraSpellId: i.ExtraSpellID,
		ExtraSchool:  schoolWithFallback(i.ExtraSchool, i.InterruptedSpell),
	}
}
func Absorbed(from time.Time, idx int32, a *messages.Absorbed) *chronicleproto.Absorbed {
	return &chronicleproto.Absorbed{
		Meta:            EventMeta(from, idx, a),
		Attacker:        a.Attacker.String(),
		Target:          a.Target.String(),
		DamageSpellData: SpellData(a.DamageSpell),
		Caster:          a.Caster.String(),
		AbsorbSpellData: SpellData(a.AbsorbSpell),
		AbsorbSchool:    schoolWithFallback(a.AbsorbSchool, a.AbsorbSpell),
		Amount:          a.Amount,
		Estimated:       a.IsSynthetic(),
	}
}

func DispelTypeConv(dt chrondbc.DispelType) chronicleproto.DispelType {
	return chronicleproto.DispelType(dt)
}

// CompanionStats converts a CompanionStats parser message to its proto representation.
func CompanionStats(from time.Time, idx int32, msg *messages.CompanionStats) *chronicleproto.CompanionStats {
	buckets := make([]int32, len(msg.Buckets))
	for i, v := range msg.Buckets {
		//nolint:gosec
		buckets[i] = int32(v)
	}
	return &chronicleproto.CompanionStats{
		Meta:    EventMeta(from, idx, msg),
		Dirty:   int32(msg.Dirty), //nolint:gosec
		Buckets: buckets,
	}
}

func RaidGroup(from time.Time, idx int32, msg *messages.RaidGroup) *chronicleproto.RaidGroup {
	members := make([]string, 0, messages.RaidGroupCount*messages.RaidGroupSize)
	for _, group := range msg.Groups {
		for _, member := range group {
			if member.IsZero() {
				members = append(members, "")
			} else {
				members = append(members, member.String())
			}
		}
	}
	return &chronicleproto.RaidGroup{
		Meta:             EventMeta(from, idx, msg),
		GroupMemberGuids: members,
	}
}

// Consume converts a Consume parser message to its proto representation.
func Consume(from time.Time, idx int32, ev *messages.Consume) *chronicleproto.Consume {
	return &chronicleproto.Consume{
		Meta:                EventMeta(from, idx, ev),
		ConsumeId:           ev.ConsumeID,
		EvidenceId:          ev.EvidenceID,
		Player:              ev.Player.String(),
		ItemId:              ev.ItemID,
		ItemName:            ev.ItemName,
		CandidateItemIds:    ev.CandidateItemIDs,
		SpellData:           SpellData(ev.SpellData),
		Kind:                chronicleproto.EvidenceKind(ev.Kind),
		Confidence:          chronicleproto.EvidenceConfidence(ev.Confidence),
		ConsumedAtUnixMilli: ev.ConsumedAtUnixMs,
		ObservedAtUnixMilli: ev.ObservedAtUnixMs,
		Amount:              ev.Amount,
		ResourceType:        ev.ResourceType,
		IsProjection:        ev.IsProjection,
	}
}
