package serviceeventrepair

import (
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/combatmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
)

// A terminal snapshot establishes fight-end rollup. Otherwise the approved
// policy permits stable recorded-owner INFERENCE, not proof of a complete
// ownership history: UNIT_INFO updates need not emit classification snapshots.
// Exact per-player source reconciliation remains mandatory in the caller.
func lucifronRecordedOwners(events []razorgoreReplayEvent, end time.Time, encounterID uuid.UUID, p *RepairPlan) (map[guid.GUID]guid.GUID, error) {
	firstDamage := map[guid.GUID]int32{}
	for _, event := range events {
		if m, ok := event.message.(*messages.Damage); ok && m.Caster != nil && !m.Caster.IsPlayer() && !m.Target.IsPlayer() && combatmetrics.EffectiveDamage(m) > 0 {
			if _, seen := firstDamage[*m.Caster]; !seen {
				firstDamage[*m.Caster] = event.index
			}
		}
	}
	owners := map[guid.GUID]guid.GUID{}
	firstSnapshot := map[guid.GUID]int32{}
	terminal := map[guid.GUID]bool{}
	seen := map[guid.GUID]bool{}
	observed := map[guid.GUID]guid.GUID{}
	// Walk stream order, not maps, so inference warnings remain deterministic.
	order := []guid.GUID{}
	for _, event := range events {
		m, ok := event.message.(*messages.UnitClassificationEvent)
		if !ok {
			continue
		}
		if m.UnitType != unitdb.UnitTypeFromGUID(m.Target) {
			return nil, errors.New("classification type contradicts GUID")
		}
		if m.Owner != nil && (!m.Owner.IsPlayer() || m.Owner.IsZero() || m.Target.IsPlayer()) {
			return nil, errors.New("unsupported recorded ownership chain or player owner")
		}
		if _, source := firstDamage[m.Target]; !source {
			continue
		}
		if m.Controller != nil {
			return nil, errors.New("controlled nonplayer source has unsupported ownership")
		}
		owner := guid.GUID(0)
		if m.Owner != nil {
			owner = *m.Owner
		}
		if seen[m.Target] && observed[m.Target] != owner {
			return nil, errors.New("nonplayer source ownership changes or clears within encounter")
		}
		if !seen[m.Target] {
			firstSnapshot[m.Target] = event.index
			order = append(order, m.Target)
		}
		seen[m.Target] = true
		observed[m.Target] = owner
		if event.at.Equal(end) {
			if terminal[m.Target] {
				return nil, errors.New("multiple terminal ownership snapshots are ambiguous")
			}
			terminal[m.Target] = true
		}
	}
	for _, source := range order {
		owner := observed[source]
		if owner.IsZero() {
			continue
		}
		// Even terminal ownership cannot retroactively establish who owned a
		// source when its earlier damage occurred.
		if firstSnapshot[source] >= firstDamage[source] {
			return nil, errors.New("recorded owner must precede first nonplayer damage")
		}
		owners[source] = owner
		if !terminal[source] {
			p.Warnings = append(p.Warnings, fmt.Sprintf("Stable recorded-owner inference in encounter %s for source %s -> owner %s: encounter-local snapshots agree before damage, but terminal ownership is not proven; all player full totals must reconcile", encounterID, source, owner))
		}
	}
	return owners, nil
}
