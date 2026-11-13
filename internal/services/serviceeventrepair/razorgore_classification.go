package serviceeventrepair

import (
	"errors"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// A pet's damage is credited under its GUID during combat and merged into its
// fight-end owner by logparse. An explicit terminal snapshot proves that owner;
// absence of any possession snapshot excludes an alternative controller credit.
// Earlier owner snapshots need not agree: only the final owner is used by the
// parser's merge. Full per-player upper-bound reconciliation in the evaluator
// proves all candidate pet damage was eligible, without assuming that sparse
// classification snapshots captured every UNIT_INFO affiliation update.
func razorgoreProvenPetOwners(events []razorgoreReplayEvent, end time.Time) (map[guid.GUID]guid.GUID, error) {
	owners := map[guid.GUID]guid.GUID{}
	possessed := map[guid.GUID]bool{}
	terminal := map[guid.GUID]bool{}
	for _, event := range events {
		c, ok := event.message.(*messages.UnitClassificationEvent)
		if !ok {
			continue
		}
		if c.UnitType != unitdb.UnitTypeFromGUID(c.Target) {
			return nil, errors.New("classification type contradicts GUID")
		}
		if c.Controller != nil {
			possessed[c.Target] = true
		}
		if !event.at.Equal(end) {
			continue
		}
		if terminal[c.Target] {
			return nil, errors.New("multiple terminal classification snapshots are ambiguous")
		}
		terminal[c.Target] = true
		if c.Owner != nil && c.Owner.IsPlayer() && !c.Owner.IsZero() && !c.Target.IsPlayer() {
			owners[c.Target] = *c.Owner
		}
	}
	for target := range possessed {
		delete(owners, target)
	}
	return owners, nil
}

// Match logparse's pet-to-owner merge without modifying the DPSTracker result:
// ClassifyDamage still needs its original pet entries and damage-credit pointers.
func razorgoreMergePetDamage(result *rankings.DPSResult) *rankings.DPSResult {
	merged := &rankings.DPSResult{Units: make(map[guid.GUID]*rankings.UnitCombatStats)}
	for id, stats := range result.Units {
		if stats.IsPlayer {
			copyStats := *stats
			merged.Units[id] = &copyStats
		}
	}
	for _, stats := range result.Units {
		if stats.IsPlayer || stats.OwnerGUID == nil {
			continue
		}
		owner := merged.Units[*stats.OwnerGUID]
		if owner == nil {
			continue
		} // source-row reconciliation rejects a missing player
		owner.DamageDone += stats.DamageDone
		owner.RankedDamageDone += stats.RankedDamageDone
		owner.UnrankedDamageDone += stats.UnrankedDamageDone
	}
	return merged
}
