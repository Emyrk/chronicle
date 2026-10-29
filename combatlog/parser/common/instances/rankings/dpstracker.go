package rankings

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/combatmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
)

var (
	_ instancehook.Hook               = (*DPSTracker)(nil)
	_ instancehook.FightFinalizedHook = (*DPSTracker)(nil)
)

// UnitCombatStats holds accumulated combat metrics for a single unit in an encounter.
type UnitCombatStats struct {
	// DamageDone is all player-attributable damage to hostile non-player targets.
	DamageDone int64
	// RankedDamageDone is effective damage eligible under the encounter's target rule.
	// Without a rule, all player-attributable hostile damage is ranked.
	RankedDamageDone   int64
	UnrankedDamageDone int64
	DamageTaken        int64
	// HealingDone is effective healing only (overheal subtracted).
	HealingDone int64
	// HealingAbsorbed is damage prevented by absorb shields cast by this unit
	// (e.g., Power Word: Shield), attributed to the shield caster.
	HealingAbsorbed int64
	IsPlayer        bool
	OwnerGUID       *guid.GUID // Non-nil if this unit is a pet/totem/summon.
	// Talents snapshot at fight end. Nil if the player had no talent data
	// (e.g., talents were invalidated by a respec, or addon didn't report).
	Talents *combatant.Talents
	// ObservedForm is the dominant Cat/Bear form during the encounter. It is
	// empty when neither form was observed or their observed durations tie.
	ObservedForm string
}

// DPSResult holds per-unit combat stats for a single encounter.
type DPSResult struct {
	Units map[guid.GUID]*UnitCombatStats
}

// healingCredit records enough to exclude healing outside a finalized ranking
// window without retaining message objects (which the parser may reuse).
type healingCredit struct {
	caster   guid.GUID
	at       time.Time
	amount   int64
	absorbed bool
}

// DPSTracker is an instance hook that accumulates damage done, damage taken,
// and healing done per unit per encounter. At FightEnded it classifies each
// unit (player vs creature, owner relationship) via unitdb and stores the
// results keyed by encounter ID.
type DPSTracker struct {
	instancehook.BaseHook
	units          *unitdb.Units
	identifier     *identifier.Identifier
	assemblyOfIron *DPSTrackerAssemblyOfIron

	// Per-encounter state, reset on FightStarted.
	damageDone       map[guid.GUID]int64
	rankedDamageDone map[guid.GUID]int64
	damageCredits    map[*messages.Damage]guid.GUID
	assemblyPending  map[guid.GUID][]*messages.Damage
	assemblyExcluded map[*messages.Damage]bool
	damageTaken      map[guid.GUID]int64
	healingDone      map[guid.GUID]int64
	absorbDone       map[guid.GUID]int64
	healingCredits   []healingCredit
	forms            *druidFormTracker

	// Results across all encounters.
	results map[uuid.UUID]*DPSResult
}

// NewDPSTracker creates a DPS tracker that uses the unit database and instance
// identifier to classify targets for raw and ranked damage totals.
func NewDPSTracker(units *unitdb.Units, idf *identifier.Identifier, rule DamageRule) *DPSTracker {
	tracker := &DPSTracker{
		units:            units,
		identifier:       idf,
		damageDone:       make(map[guid.GUID]int64),
		rankedDamageDone: make(map[guid.GUID]int64),
		damageTaken:      make(map[guid.GUID]int64),
		healingDone:      make(map[guid.GUID]int64),
		absorbDone:       make(map[guid.GUID]int64),
		forms:            newDruidFormTracker(),
		results:          make(map[uuid.UUID]*DPSResult),
	}
	if rule == DamageRuleAssemblyOfIron {
		tracker.assemblyOfIron = newDPSTrackerAssemblyOfIron()
	}
	return tracker
}

func (t *DPSTracker) FightStarted(_ uuid.UUID, m messages.Message) {
	t.damageDone = make(map[guid.GUID]int64)
	t.rankedDamageDone = make(map[guid.GUID]int64)
	t.damageCredits = make(map[*messages.Damage]guid.GUID)
	t.damageTaken = make(map[guid.GUID]int64)
	t.healingDone = make(map[guid.GUID]int64)
	t.absorbDone = make(map[guid.GUID]int64)
	t.healingCredits = nil
	t.forms.FightStarted(m)
	if t.assemblyOfIron != nil {
		t.assemblyOfIron.reset()
		t.assemblyPending = make(map[guid.GUID][]*messages.Damage)
		t.assemblyExcluded = make(map[*messages.Damage]bool)
	}
}

func (t *DPSTracker) isRankedDamageTarget(target guid.GUID) bool {
	if info, ok := t.units.Info[target]; ok && info.Boss {
		return true
	}
	if t.identifier == nil {
		return false
	}
	entry, ok := target.GetEntry()
	if !ok {
		return false
	}
	identity, ok := t.identifier.HostileEntries()[entry]
	return ok && identity.Boss
}

// ClassifyDamage assigns the encounter's finalized target rule to a buffered
// message and updates the already-snapshotted per-player ranking totals.
func (t *DPSTracker) ClassifyDamage(encounterID uuid.UUID, rule DamageTargets, msg *messages.Damage, window *encounter.RankingWindow) {
	msg.Unranked = 0
	eligible := combatmetrics.EffectiveDamage(msg)
	if eligible <= 0 {
		return
	}
	ranked := window == nil || (!msg.Date().Before(window.Start) && !msg.Date().After(window.End))
	if t.assemblyOfIron != nil {
		if t.assemblyExcluded[msg] || !ranked {
			msg.Unranked = eligible
		}
		return
	}
	switch rule.Mode {
	case DamageTargetsBossOnly:
		ranked = ranked && t.isRankedDamageTarget(msg.Target)
	case DamageTargetsEntries:
		allowedTarget := false
		if entry, ok := msg.Target.GetEntry(); ok {
			for _, allowed := range rule.EntryIDs {
				if entry == allowed {
					allowedTarget = true
					break
				}
			}
		}
		ranked = ranked && allowedTarget
	}
	if ranked {
		return
	}
	msg.Unranked = eligible
	credit, ok := t.damageCredits[msg]
	if !ok || t.assemblyOfIron != nil {
		return
	}
	if stats := t.results[encounterID].Units[credit]; stats != nil {
		stats.RankedDamageDone -= eligible
		stats.UnrankedDamageDone += eligible
	}
}

// ClassifyHealing limits healing and absorb totals used by HPS rankings to
// the same interval as ranked damage. Raw encounter events remain unchanged.
func (t *DPSTracker) ClassifyHealing(encounterID uuid.UUID, window *encounter.RankingWindow) {
	defer func() { t.healingCredits = nil }()
	if window == nil {
		return
	}
	result := t.results[encounterID]
	if result == nil {
		return
	}
	for _, credit := range t.healingCredits {
		if !credit.at.Before(window.Start) && !credit.at.After(window.End) {
			continue
		}
		if stats := result.Units[credit.caster]; stats != nil {
			if credit.absorbed {
				stats.HealingAbsorbed -= credit.amount
			} else {
				stats.HealingDone -= credit.amount
			}
		}
	}
}

// FinishDamageClassification keeps Assembly's phase-specific ranking total and
// exposes the remainder as unranked without changing its phase algorithm.
func (t *DPSTracker) FinishDamageClassification(encounterID uuid.UUID) {
	if t.assemblyOfIron != nil {
		for _, stats := range t.results[encounterID].Units {
			stats.UnrankedDamageDone = stats.DamageDone - stats.RankedDamageDone
		}
	}
	t.damageCredits = nil
	t.assemblyPending = nil
	t.assemblyExcluded = nil
}

func (t *DPSTracker) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	t.forms.ProcessMessage(active, m)
	if !active {
		return nil
	}

	switch msg := m.(type) {
	case *messages.Damage:
		effectiveDamage := combatmetrics.EffectiveDamage(msg)
		if effectiveDamage <= 0 {
			return nil
		}

		// Track damage taken by players from all sources (for role detection).
		targetCls := t.units.Classify(msg.Target)
		if targetCls.Type == unitdb.UnitTypePlayer {
			t.damageTaken[msg.Target] += int64(msg.Amount)
		}

		// Only track player (or pet/totem) damage output to hostile non-player targets.
		// Exclude player targets even if temporarily hostile (e.g., mind-controlled).
		if msg.Caster == nil {
			return nil // skip environmental damage for damage-done
		}
		// Never count damage to players or player-owned units (pets/totems).
		if targetCls.Type == unitdb.UnitTypePlayer {
			return nil
		}
		if targetCls.Relation.HasOwner() {
			ownerCls := t.units.Classify(*targetCls.Relation.Owner)
			if ownerCls.Type == unitdb.UnitTypePlayer {
				return nil
			}
		}
		caster := *msg.Caster
		casterCls := t.units.Classify(caster)

		// Determine who gets credit for this damage.
		// - Player caster → credit to player
		// - Pet/totem (has owner) → credit to the pet GUID (owner attribution in logparse)
		// - Possessed creature (mind control) → credit to the controlling player
		// - Anything else → skip
		creditGUID := caster
		if casterCls.Type == unitdb.UnitTypePlayer {
			// Direct player damage — credit to player.
		} else if casterCls.Relation.HasOwner() {
			// Pet/totem — record under pet GUID; logparse sums into owner.
		} else if casterCls.Possession != nil && t.units.Classify(casterCls.Possession.Controller).Type == unitdb.UnitTypePlayer {
			// Possessed creature — credit to the controlling player directly.
			creditGUID = casterCls.Possession.Controller
		} else {
			return nil // not player-attributable damage
		}

		if targetCls.Affiliation == unitdb.AffiliationHostile {
			t.damageDone[creditGUID] += effectiveDamage
			t.damageCredits[msg] = creditGUID
			if t.assemblyOfIron != nil && t.assemblyOfIron.trackDamage(msg.Target, creditGUID, effectiveDamage) {
				t.assemblyPending[msg.Target] = append(t.assemblyPending[msg.Target], msg)
				return nil
			}
			t.rankedDamageDone[creditGUID] += effectiveDamage
		}

	case *messages.Slain:
		if t.assemblyOfIron != nil {
			if t.assemblyOfIron.isPhaseTarget(msg.Victim) {
				for target, pending := range t.assemblyPending {
					if target != msg.Victim {
						for _, damage := range pending {
							t.assemblyExcluded[damage] = true
						}
					}
				}
				clear(t.assemblyPending)
			}
			t.assemblyOfIron.commitSlainTarget(msg.Victim, t.rankedDamageDone)
		}

	case *messages.Heal:
		// Match the Healing Done panel: only count effective healing to players
		// and player-owned pets. Healing friendly NPCs is not rankable healing.
		if !combatmetrics.IsPlayerOrPlayerOwned(t.units, msg.Target) {
			return nil
		}
		effective := int64(msg.Amount) - int64(msg.Overheal)
		if effective > 0 {
			t.healingDone[msg.Caster] += effective
			t.healingCredits = append(t.healingCredits, healingCredit{caster: msg.Caster, at: msg.Date(), amount: effective})
		}

	case *messages.Absorbed:
		// Match the Healing Done panel: only count damage prevented on players
		// and player-owned pets, credited to the shield caster.
		if !combatmetrics.IsPlayerOrPlayerOwned(t.units, msg.Target) {
			return nil
		}
		if msg.Amount > 0 && !msg.Caster.IsZero() {
			t.absorbDone[msg.Caster] += int64(msg.Amount)
			t.healingCredits = append(t.healingCredits, healingCredit{caster: msg.Caster, at: msg.Date(), amount: int64(msg.Amount), absorbed: true})
		}
	}

	return nil
}

func (t *DPSTracker) FightEnded(encounterID uuid.UUID, m messages.Message) {
	if t.assemblyOfIron != nil {
		t.assemblyOfIron.commitUnresolved(t.rankedDamageDone)
	}

	// Merge all GUIDs seen across all three metric maps.
	allGUIDs := make(map[guid.GUID]struct{})
	for g := range t.damageDone {
		allGUIDs[g] = struct{}{}
	}
	for g := range t.damageTaken {
		allGUIDs[g] = struct{}{}
	}
	for g := range t.healingDone {
		allGUIDs[g] = struct{}{}
	}
	for g := range t.absorbDone {
		allGUIDs[g] = struct{}{}
	}

	result := &DPSResult{
		Units: make(map[guid.GUID]*UnitCombatStats, len(allGUIDs)),
	}

	for g := range allGUIDs {
		cls := t.units.Classify(g)
		isPlayer := cls.Type == unitdb.UnitTypePlayer
		// Snapshot talents for players from the unitdb at fight end.
		var talents *combatant.Talents
		if isPlayer {
			if p, ok := t.units.Players[g]; ok && p.Talents != nil {
				// Deep copy the summary so it's not mutated later.
				cp := *p.Talents
				talents = &cp
			}
		}
		var observedForm string
		if isPlayer {
			var fightEnd time.Time
			if m != nil {
				fightEnd = m.Date()
			}
			observedForm = t.forms.Dominant(g, fightEnd).String()
		}
		stats := &UnitCombatStats{
			DamageDone:       t.damageDone[g],
			RankedDamageDone: t.rankedDamageDone[g],
			DamageTaken:      t.damageTaken[g],
			HealingDone:      t.healingDone[g],
			HealingAbsorbed:  t.absorbDone[g],
			IsPlayer:         isPlayer,
			Talents:          talents,
			ObservedForm:     observedForm,
		}
		if cls.Relation.HasOwner() {
			owner := *cls.Relation.Owner
			stats.OwnerGUID = &owner
		}
		result.Units[g] = stats
	}

	t.results[encounterID] = result
}

// FightFinalized corrects form durations to the materialized fight boundaries.
// FightStarted receives the message that triggered detection, which can be later
// than an authoritative encounter boundary or character activity start.
func (t *DPSTracker) FightFinalized(encounterID uuid.UUID, start, end time.Time) {
	t.forms.FightFinalized(start)

	result := t.results[encounterID]
	if result == nil {
		return
	}
	for unit, stats := range result.Units {
		if stats.IsPlayer {
			stats.ObservedForm = t.forms.Dominant(unit, end).String()
		}
	}
}

func (t *DPSTracker) Finalize(_ context.Context) error {
	return nil
}

// Result returns the accumulated DPS results keyed by encounter ID.
func (t *DPSTracker) Result() map[uuid.UUID]*DPSResult {
	return t.results
}
