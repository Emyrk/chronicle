package rankings

import (
	"context"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/combatmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

var _ instancehook.Hook = (*DPSTracker)(nil)

// UnitCombatStats holds accumulated combat metrics for a single unit in an encounter.
type UnitCombatStats struct {
	DamageDone  int64
	DamageTaken int64
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

	// IncomingAutoAttacks maps hostile source GUID → number of Auto Attack
	// attempts this player received (including zero-damage misses, dodges,
	// parries, etc.). Only populated for players. Used by roleinfer for
	// source-aware tank inference.
	IncomingAutoAttacks map[guid.GUID]int
}

// DPSResult holds per-unit combat stats for a single encounter.
type DPSResult struct {
	Units map[guid.GUID]*UnitCombatStats
}

// DPSTracker is an instance hook that accumulates damage done, damage taken,
// and healing done per unit per encounter. At FightEnded it classifies each
// unit (player vs creature, owner relationship) via unitdb and stores the
// results keyed by encounter ID.
type DPSTracker struct {
	instancehook.BaseHook
	units *unitdb.Units

	// Per-encounter state, reset on FightStarted.
	damageDone  map[guid.GUID]int64
	damageTaken map[guid.GUID]int64
	healingDone map[guid.GUID]int64
	absorbDone  map[guid.GUID]int64

	// incomingAutoAttacks tracks hostile-source → player-target → attempt count
	// for auto-attack (SWING) events directed at players, including zero-damage
	// misses, dodges, parries, etc. Reset per encounter.
	incomingAutoAttacks map[guid.GUID]map[guid.GUID]int

	// Results across all encounters.
	results map[uuid.UUID]*DPSResult
}

// NewDPSTracker creates a DPS tracker that uses the given unit database for
// classifying GUIDs at fight end.
func NewDPSTracker(units *unitdb.Units) *DPSTracker {
	return &DPSTracker{
		units:               units,
		damageDone:          make(map[guid.GUID]int64),
		damageTaken:         make(map[guid.GUID]int64),
		healingDone:         make(map[guid.GUID]int64),
		absorbDone:          make(map[guid.GUID]int64),
		incomingAutoAttacks: make(map[guid.GUID]map[guid.GUID]int),
		results:             make(map[uuid.UUID]*DPSResult),
	}
}

func (t *DPSTracker) FightStarted(_ uuid.UUID, _ messages.Message) {
	t.damageDone = make(map[guid.GUID]int64)
	t.damageTaken = make(map[guid.GUID]int64)
	t.healingDone = make(map[guid.GUID]int64)
	t.absorbDone = make(map[guid.GUID]int64)
	t.incomingAutoAttacks = make(map[guid.GUID]map[guid.GUID]int)
}

func (t *DPSTracker) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	if !active {
		return nil
	}

	switch msg := m.(type) {
	case *messages.Damage:
		// Track incoming auto-attack attempts from hostile sources to players
		// BEFORE the effectiveDamage early return so zero-damage misses,
		// dodges, parries, etc. are counted for tank inference.
		if msg.Caster != nil && isAutoAttack(msg) {
			targetCls := t.units.Classify(msg.Target)
			if targetCls.Type == unitdb.UnitTypePlayer {
				casterCls := t.units.Classify(*msg.Caster)
				if casterCls.Affiliation == unitdb.AffiliationHostile && casterCls.Type != unitdb.UnitTypePlayer {
					targets := t.incomingAutoAttacks[*msg.Caster]
					if targets == nil {
						targets = make(map[guid.GUID]int)
						t.incomingAutoAttacks[*msg.Caster] = targets
					}
					targets[msg.Target]++
				}
			}
		}

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
		}

	case *messages.Absorbed:
		// Match the Healing Done panel: only count damage prevented on players
		// and player-owned pets, credited to the shield caster.
		if !combatmetrics.IsPlayerOrPlayerOwned(t.units, msg.Target) {
			return nil
		}
		if msg.Amount > 0 && !msg.Caster.IsZero() {
			t.absorbDone[msg.Caster] += int64(msg.Amount)
		}
	}

	return nil
}

func (t *DPSTracker) FightEnded(encounterID uuid.UUID, _ messages.Message) {
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
	// Also include players that only appear as auto-attack targets.
	for _, targets := range t.incomingAutoAttacks {
		for g := range targets {
			allGUIDs[g] = struct{}{}
		}
	}

	// Build per-player incoming auto-attack maps (source → count).
	playerAutoAttacks := make(map[guid.GUID]map[guid.GUID]int)
	for source, targets := range t.incomingAutoAttacks {
		for player, count := range targets {
			m := playerAutoAttacks[player]
			if m == nil {
				m = make(map[guid.GUID]int)
				playerAutoAttacks[player] = m
			}
			m[source] = count
		}
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
		stats := &UnitCombatStats{
			DamageDone:          t.damageDone[g],
			DamageTaken:         t.damageTaken[g],
			HealingDone:         t.healingDone[g],
			HealingAbsorbed:     t.absorbDone[g],
			IsPlayer:            isPlayer,
			Talents:             talents,
			IncomingAutoAttacks: playerAutoAttacks[g],
		}
		if cls.Relation.HasOwner() {
			owner := *cls.Relation.Owner
			stats.OwnerGUID = &owner
		}
		result.Units[g] = stats
	}

	t.results[encounterID] = result
}

func (t *DPSTracker) Finalize(_ context.Context) error {
	return nil
}

// Result returns the accumulated DPS results keyed by encounter ID.
func (t *DPSTracker) Result() map[uuid.UUID]*DPSResult {
	return t.results
}

// isAutoAttack returns true if the damage message represents a melee
// auto-attack (SWING). Covers both normal and off-hand swings.
func isAutoAttack(msg *messages.Damage) bool {
	if msg.SpellData != nil {
		return msg.SpellData.ID == chrondbc.SpellIDAutoAttack
	}
	// Fallback: if SpellData is nil and SourceName resolves to "Auto Attack",
	// treat it as an auto-attack. This catches edge cases where SpellData
	// was not populated.
	return msg.SpellName == nil && msg.EnvironmentType == nil
}
