package serviceeventrepair

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/warlockdemon"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"google.golang.org/protobuf/proto"
)

type razorgoreControlCast struct {
	index              int32
	at                 time.Time
	target, controller guid.GUID
	duration           time.Duration
}

// Stored addon AuraCast durations, not current spell data, reproduce lazy
// possession expiry. Repeated classification snapshots retain the original cast
// timestamp; they must never renew the duration merely by being observed again.
func razorgoreControlCasts(e razorgoreEvidence, c database.LogInstanceEncounter) ([]razorgoreControlCast, error) {
	var result []razorgoreControlCast
	found := false
	for _, row := range e.Events {
		if row.Type != database.LogInstanceEventTypeAuraCast {
			continue
		}
		if found {
			return nil, errors.New("duplicate aura_cast stream")
		}
		found = true
		raw, err := razorgoreFrame(row.Events, c.ID, c.StartTime.Time)
		if err != nil {
			return nil, err
		}
		for _, b := range raw {
			var a chronicleproto.AuraCast
			if err := proto.Unmarshal(b, &a); err != nil {
				return nil, err
			}
			if a.EffectAuraName != 2 && a.EffectAuraName != 6 {
				continue
			}
			// The parser's possession synthesizer delegates enslaved demons to
			// permanent pet ownership rather than creating PossessionChange.
			if a.Spell != nil && a.Spell.Id == 53222 {
				target, err := guid.FromString(a.GetTarget())
				if err != nil {
					return nil, err
				}
				if _, demon := warlockdemon.IsWarlockDemon(target); demon {
					continue
				}
			}
			if a.Meta == nil || a.Spell == nil || a.Spell.Id != 19832 || a.Meta.IsSynthetic || a.Meta.OffsetMilli < 0 || a.Meta.OffsetMilli > c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds() || a.DurationMS <= 0 {
				return nil, errors.New("unsupported control aura or missing authoritative duration")
			}
			target, err := guid.FromString(a.GetTarget())
			if err != nil {
				return nil, err
			}
			controller, err := guid.FromString(a.Caster)
			if err != nil {
				return nil, err
			}
			entry, _ := target.GetEntry()
			if entry != 12435 || !controller.IsPlayer() || controller.IsZero() {
				return nil, errors.New("unsupported possession target/controller")
			}
			result = append(result, razorgoreControlCast{index: a.Meta.Index, at: c.StartTime.Time.Add(time.Duration(a.Meta.OffsetMilli) * time.Millisecond), target: target, controller: controller, duration: time.Duration(a.DurationMS) * time.Millisecond})
		}
	}
	if !found {
		return nil, errors.New("missing aura_cast durations for classification replay")
	}
	return result, nil
}

// replayRazorgoreClassified is the numerical candidate boundary for a single
// encounter. It does not change proof, source identities, or encounter outcomes.
// Callers must validate the encounter/window and orchestrate the whole instance.
func replayRazorgoreClassified(e razorgoreEvidence, c database.LogInstanceEncounter, window *encounter.RankingWindow, format database.LogFormat) (*rankings.DPSResult, *rankings.SurvivabilityResult, error) {
	if format != database.LogFormat112aCcAddon {
		return nil, nil, errors.New("classification possession replay requires addon duration semantics")
	}
	if window == nil || window.Start.Before(c.StartTime.Time) || window.End.After(c.EndTime.Time) || !window.End.After(window.Start) {
		return nil, nil, errors.New("invalid classified ranking window")
	}
	events, err := razorgoreNumericEvents(e, c)
	if err != nil {
		return nil, nil, err
	}
	casts, err := razorgoreControlCasts(e, c)
	if err != nil {
		return nil, nil, err
	}
	hasClassification := false
	for _, row := range e.Events {
		if row.Type == database.LogInstanceEventTypeUnitClassification {
			hasClassification = true
		}
	}
	if !hasClassification {
		return nil, nil, errors.New("missing classification timeline")
	}
	units := unitdb.New()
	tracker := rankings.NewDPSTracker(units, nil, rankings.DamageRuleNone)
	life := rankings.NewSurvivabilityTracker()
	tracker.FightStarted(c.ID, nil)
	life.FightStarted(c.ID, nil)
	knownHostiles := instances.BlackwingLairHostiles(database.WoWFlavor{}).HostileEntries()
	var damage []*messages.Damage
	classified := map[guid.GUID]bool{}
	for _, event := range events {
		// The parser expires control before processing each original message.
		if err := units.ProcessMessage(event.message); err != nil {
			return nil, nil, err
		}
		switch m := event.message.(type) {
		case *messages.UnitClassificationEvent:
			if m.UnitType != unitdb.UnitTypeFromGUID(m.Target) {
				return nil, nil, errors.New("classification type contradicts GUID")
			}
			info := units.Info[m.Target]
			info.Guid = m.Target
			info.Owner = m.Owner
			info.IsPlayer = m.Target.IsPlayer()
			if m.Owner != nil && (!m.Owner.IsPlayer() || m.Owner.IsZero()) {
				return nil, nil, errors.New("unsupported non-player owner chain")
			}
			if m.Controller == nil {
				info.Affiliation = m.Affiliation
				units.ClearPossessed(m.Target)
			} else {
				var chosen *razorgoreControlCast
				for i := range casts {
					a := &casts[i]
					if a.index < event.index && a.target == m.Target && a.controller == *m.Controller && (chosen == nil || chosen.index < a.index) {
						chosen = a
					}
				}
				if chosen == nil || event.at.After(chosen.at.Add(chosen.duration)) {
					return nil, nil, errors.New("controlled snapshot lacks a live authoritative aura_cast")
				}
				// Preserve a known underlying affiliation, never the temporary friendly
				// classification. Registry hostiles supply the initial baseline only.
				if !classified[m.Target] {
					entry, _ := m.Target.GetEntry()
					if _, ok := knownHostiles[entry]; !ok {
						return nil, nil, errors.New("unknown pre-possession affiliation")
					}
					info.Affiliation = unitdb.AffiliationHostile
				}
				units.SetPossessed(m.Target, *m.Controller, nil, chosen.at, chosen.duration)
			}
			units.Info[m.Target] = info
			classified[m.Target] = true
		case *messages.Damage:
			if m.Amount < 0 || m.Overkill < 0 {
				return nil, nil, errors.New("invalid damage amount")
			}
			if _, ok := units.Info[m.Target]; !ok && !m.Target.IsPlayer() {
				entry, _ := m.Target.GetEntry()
				if _, known := knownHostiles[entry]; known {
					units.Info[m.Target] = unitinfo.Info{Guid: m.Target, Affiliation: unitdb.AffiliationHostile}
				}
			}
			if !event.at.Before(window.Start) && m.Caster != nil && !m.Caster.IsPlayer() && !classified[*m.Caster] {
				return nil, nil, errors.New("damage caster lacks prior classification")
			}
			// Unknown nonplayer targets may be pets. Without a classification there is
			// no reliable player-owned exclusion, so do not silently assume hostile.
			if !m.Target.IsPlayer() {
				if _, ok := units.Info[m.Target]; !ok {
					attributable := m.Caster != nil && m.Caster.IsPlayer()
					if m.Caster != nil {
						cls := units.Classify(*m.Caster)
						attributable = attributable || cls.Relation.HasOwner() || cls.Possession != nil
					}
					if attributable && !event.at.Before(window.Start) {
						entry, _ := m.Target.GetEntry()
						return nil, nil, fmt.Errorf("player-attributable damage target lacks classification or registry identity: entry %d event %d", entry, event.index)
					}
				}
			}
			damage = append(damage, m)
		case *messages.Heal:
			if !event.at.Before(window.Start) && ((!m.Caster.IsPlayer() && !classified[m.Caster]) || (!m.Target.IsPlayer() && !classified[m.Target])) {
				return nil, nil, errors.New("healing unit lacks prior classification")
			}
		case *messages.Absorbed:
			if !event.at.Before(window.Start) && ((!m.Caster.IsPlayer() && !classified[m.Caster]) || (!m.Target.IsPlayer() && !classified[m.Target])) {
				return nil, nil, errors.New("absorb unit lacks prior classification")
			}
		}
		if err := tracker.ProcessMessage(true, c.ID, event.message); err != nil {
			return nil, nil, err
		}
		if err := life.ProcessMessage(true, c.ID, event.message); err != nil {
			return nil, nil, err
		}
	}
	tracker.FightEnded(c.ID, nil)
	full := razorgoreMergeOwnerMetrics(tracker.Result()[c.ID])
	// P1 can precede a pet's first classification snapshot. Do not invent that
	// history: retain the existing full credited damage and reconstruct only P2.
	// Raw source totals are invariant under the phase-window repair.
	rows := map[guid.GUID]database.EncounterDpsRanking{}
	for _, row := range e.Rankings {
		if !row.EncounterID.Valid || row.EncounterID.UUID != c.ID {
			continue
		}
		id, err := guid.FromString(row.PlayerGuid)
		if err != nil || !id.IsPlayer() || id.IsZero() {
			return nil, nil, errors.New("invalid source player")
		}
		if _, duplicate := rows[id]; duplicate {
			return nil, nil, errors.New("duplicate source player")
		}
		if row.DamageDone < 0 || row.UnrankedDamageDone < 0 || row.DamageDone > math.MaxInt64-row.UnrankedDamageDone {
			return nil, nil, errors.New("invalid raw source damage")
		}
		rows[id] = row
	}
	if len(rows) == 0 {
		return nil, nil, errors.New("missing source rows")
	}
	for _, m := range damage {
		tracker.ClassifyDamage(c.ID, rankings.DamageTargets{Mode: rankings.DamageTargetsEntries, EntryIDs: []uint32{12435}}, m, window)
	}
	tracker.ClassifyHealing(c.ID, window)
	tracker.FinishDamageClassification(c.ID)
	life.FightFinalized(c.ID, window.Start, window.End)
	result := razorgoreMergeOwnerMetrics(tracker.Result()[c.ID])
	for id := range result.Units {
		if _, ok := rows[id]; !ok {
			return nil, nil, errors.New("replay player missing from source rows")
		}
	}
	for id, row := range rows {
		stats := result.Units[id]
		if stats == nil {
			stats = &rankings.UnitCombatStats{IsPlayer: true}
			result.Units[id] = stats
		}
		before := full.Units[id]
		if before == nil {
			before = &rankings.UnitCombatStats{}
		}
		if (row.HealingDone != before.HealingDone || row.AbsorbedDone != before.HealingAbsorbed) && (row.HealingDone != stats.HealingDone || row.AbsorbedDone != stats.HealingAbsorbed) {
			return nil, nil, errors.New("classified healing/absorb totals do not reconcile to source rows")
		}
		raw := row.DamageDone + row.UnrankedDamageDone
		if stats.RankedDamageDone > raw {
			return nil, nil, errors.New("phase-two credit exceeds persisted raw total")
		}
		stats.DamageDone = raw
		stats.UnrankedDamageDone = raw - stats.RankedDamageDone
	}
	return result, life.Result()[c.ID], nil
}

func razorgoreMergeOwnerMetrics(result *rankings.DPSResult) *rankings.DPSResult {
	merged := razorgoreMergePetDamage(result)
	for _, s := range result.Units {
		if s.IsPlayer || s.OwnerGUID == nil {
			continue
		}
		if owner := merged.Units[*s.OwnerGUID]; owner != nil {
			owner.HealingDone += s.HealingDone
			owner.HealingAbsorbed += s.HealingAbsorbed
		}
	}
	return merged
}
