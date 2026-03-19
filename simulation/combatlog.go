package simulation

import (
	"fmt"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/simulation/combat"
	"github.com/Emyrk/chronicle/simulation/gamedata"
)

// CombatLog collects protobuf combat log events from the simulation.
// These events are identical to what Chronicle's combat log parser produces,
// so the full EventsPanels frontend can render sim results.
type CombatLog struct {
	// Streams matching Chronicle's event stream types.
	Damage         []*chronicleproto.Damage
	Heal           []*chronicleproto.Heal
	Cast           []*chronicleproto.Cast
	Aura           []*chronicleproto.Aura
	ResourceChange []*chronicleproto.ResourceChange
	Slain          []*chronicleproto.Slain

	playerGUID  string // hex GUID string for the simulated player
	playerName  string
	targetGUID  string // hex GUID string for the target
	targetName  string
	startTimeMs int64  // unix millis of sim start (arbitrary epoch)
	index       int32
}

// NewCombatLog creates a combat log collector for a sim run.
// playerID and targetEntryID are used to construct GUID strings.
func NewCombatLog(playerName string, playerID uint64, targetName string, targetEntryID uint32) *CombatLog {
	return &CombatLog{
		playerGUID:  fmt.Sprintf("0x%016X", playerID),
		playerName:  playerName,
		targetGUID:  fmt.Sprintf("0xF130%06X%06X", targetEntryID, uint32(1)),
		targetName:  targetName,
		startTimeMs: 1000000000000, // arbitrary epoch
	}
}

func (cl *CombatLog) meta(timeMs int32) *chronicleproto.EventMeta {
	cl.index++
	return &chronicleproto.EventMeta{
		Index:       cl.index,
		OffsetMilli: int64(timeMs),
	}
}

func (cl *CombatLog) spellData(spell *gamedata.SpellData) *chronicleproto.SpellData {
	if spell == nil {
		return nil
	}
	return &chronicleproto.SpellData{
		Id:   spell.ID,
		Name: spell.Name,
	}
}

func outcomeToHitType(o combat.Outcome, isCrit bool) uint32 {
	// Maps to chronicle's HitType values used by the frontend.
	// These match the types.HitType enum values.
	switch o {
	case combat.OutcomeHit:
		return 0 // NORMAL
	case combat.OutcomeCrit:
		return 1 // CRITICAL
	case combat.OutcomeGlancing:
		return 3 // GLANCING
	case combat.OutcomeCrushing:
		return 4 // CRUSHING
	case combat.OutcomeBlock:
		return 6 // BLOCK
	case combat.OutcomeMiss:
		return 7 // MISS
	case combat.OutcomeDodge:
		return 8 // DODGE
	case combat.OutcomeParry:
		return 9 // PARRY
	case combat.OutcomeResist:
		return 10 // RESIST
	default:
		return 0
	}
}

func schoolToProto(school int32) chronicleproto.School {
	// Map school mask to proto enum.
	switch {
	case school&gamedata.SchoolMaskFire != 0:
		return chronicleproto.School_Fire
	case school&gamedata.SchoolMaskFrost != 0:
		return chronicleproto.School_Frost
	case school&gamedata.SchoolMaskNature != 0:
		return chronicleproto.School_Nature
	case school&gamedata.SchoolMaskShadow != 0:
		return chronicleproto.School_Shadow
	case school&gamedata.SchoolMaskArcane != 0:
		return chronicleproto.School_Arcane
	case school&gamedata.SchoolMaskHoly != 0:
		return chronicleproto.School_Holy
	case school&gamedata.SchoolMaskPhysical != 0:
		return chronicleproto.School_Physical
	default:
		return chronicleproto.School_Physical
	}
}

// RecordDamage logs a damage event.
func (cl *CombatLog) RecordDamage(timeMs int32, spell *gamedata.SpellData, dmgResult combat.DamageResult, isPlayerSource bool) {
	sourceName := "Auto Attack"
	if spell != nil {
		sourceName = spell.Name
	}

	var caster, target string
	if isPlayerSource {
		caster = cl.playerGUID
		target = cl.targetGUID
	} else {
		caster = cl.targetGUID
		target = cl.playerGUID
	}

	var tailers []*chronicleproto.Tailer
	if dmgResult.Resisted > 0 {
		r := uint32(dmgResult.Resisted)
		tailers = append(tailers, &chronicleproto.Tailer{
			Amount:  &r,
			HitType: 10, // RESIST
		})
	}
	if dmgResult.Absorbed > 0 {
		a := uint32(dmgResult.Absorbed)
		tailers = append(tailers, &chronicleproto.Tailer{
			Amount:  &a,
			HitType: 5, // ABSORB
		})
	}

	cl.Damage = append(cl.Damage, &chronicleproto.Damage{
		Meta:       cl.meta(timeMs),
		Caster:     &caster,
		SourceName: sourceName,
		Target:     target,
		HitType:    outcomeToHitType(dmgResult.Outcome, dmgResult.Outcome == combat.OutcomeCrit),
		Amount:     dmgResult.Damage,
		School:     schoolToProto(dmgResult.School),
		Tailers:    tailers,
		SpellData:  cl.spellData(spell),
	})
}

// RecordCastStart logs a "begins to cast" event.
func (cl *CombatLog) RecordCastStart(timeMs int32, spell *gamedata.SpellData) {
	target := cl.targetGUID
	cl.Cast = append(cl.Cast, &chronicleproto.Cast{
		Meta:   cl.meta(timeMs),
		Caster: cl.playerGUID,
		Action: chronicleproto.CastAction_ActionBeginsToCast,
		Target: &target,
		Spell: &chronicleproto.Spell{
			Name: spell.Name,
			Id:   spell.ID,
		},
	})
}

// RecordCastComplete logs a "casts" event.
func (cl *CombatLog) RecordCastComplete(timeMs int32, spell *gamedata.SpellData) {
	target := cl.targetGUID
	cl.Cast = append(cl.Cast, &chronicleproto.Cast{
		Meta:   cl.meta(timeMs),
		Caster: cl.playerGUID,
		Action: chronicleproto.CastAction_ActionCasts,
		Target: &target,
		Spell: &chronicleproto.Spell{
			Name: spell.Name,
			Id:   spell.ID,
		},
	})
}

// RecordAuraApplied logs an aura application.
func (cl *CombatLog) RecordAuraApplied(timeMs int32, spell *gamedata.SpellData, onTarget bool) {
	target := cl.targetGUID
	if !onTarget {
		target = cl.playerGUID
	}
	cl.Aura = append(cl.Aura, &chronicleproto.Aura{
		Meta:          cl.meta(timeMs),
		Target:        target,
		SpellName:     spell.Name,
		CurrentAmount: 1,
		Application:   chronicleproto.AuraApplication_ApplicationGains,
		State:         chronicleproto.AuraState_StateAdded,
		SpellData:     cl.spellData(spell),
		IsBuff:        !onTarget, // if on target = debuff, on player = buff
	})
}

// RecordAuraRemoved logs an aura removal.
func (cl *CombatLog) RecordAuraRemoved(timeMs int32, spellName string, spellID int32, onTarget bool) {
	target := cl.targetGUID
	if !onTarget {
		target = cl.playerGUID
	}
	cl.Aura = append(cl.Aura, &chronicleproto.Aura{
		Meta:        cl.meta(timeMs),
		Target:      target,
		SpellName:   spellName,
		Application: chronicleproto.AuraApplication_ApplicationFades,
		State:       chronicleproto.AuraState_StateRemoved,
		SpellData: &chronicleproto.SpellData{
			Id:   spellID,
			Name: spellName,
		},
	})
}

// RecordResourceChange logs a mana/rage/energy change.
func (cl *CombatLog) RecordResourceChange(timeMs int32, amount int32, resourceType string, spellName *string) {
	direction := "GAIN"
	if amount < 0 {
		direction = "LOSS"
	}
	caster := cl.playerGUID
	cl.ResourceChange = append(cl.ResourceChange, &chronicleproto.ResourceChange{
		Meta:         cl.meta(timeMs),
		Target:       cl.playerGUID,
		Amount:       amount,
		ResourceType: resourceType,
		Caster:       &caster,
		SourceName:   spellName,
		Direction:    direction,
	})
}
