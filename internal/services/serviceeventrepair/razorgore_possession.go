package serviceeventrepair

import (
	"errors"
	"math"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/combatmetrics"
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
	spellID            int32
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
			if a.Meta == nil || a.Spell == nil || a.Spell.Id <= 0 || a.Meta.IsSynthetic || a.Meta.OffsetMilli < 0 || a.Meta.OffsetMilli > c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds() || a.DurationMS <= 0 {
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
			if target.IsZero() || controller.IsZero() || target == controller {
				return nil, errors.New("unsupported possession target/controller")
			}
			result = append(result, razorgoreControlCast{index: a.Meta.Index, spellID: a.Spell.Id, at: c.StartTime.Time.Add(time.Duration(a.Meta.OffsetMilli) * time.Millisecond), target: target, controller: controller, duration: time.Duration(a.DurationMS) * time.Millisecond})
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
func replayRazorgoreClassified(e razorgoreEvidence, c database.LogInstanceEncounter, window *encounter.RankingWindow, format database.LogFormat, reports ...*RazorgoreRepairPlan) (*rankings.DPSResult, *rankings.SurvivabilityResult, error) {
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
	var report *RazorgoreRepairPlan
	if len(reports) > 0 {
		report = reports[0]
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
					if a.index < event.index && !a.at.After(event.at) && a.target == m.Target && a.controller == *m.Controller && (chosen == nil || chosen.index < a.index) {
						chosen = a
					}
				}
				if chosen == nil || m.Spell == nil || chosen.spellID != int32(m.Spell.ID) || event.at.After(chosen.at.Add(chosen.duration)) {
					return nil, nil, errors.New("controlled snapshot lacks a live authoritative aura_cast")
				}
				// Preserve a known underlying affiliation, never the temporary control
				// classification. Players and registry hostiles supply initial baselines.
				if !classified[m.Target] && m.Target.IsPlayer() {
					info.Affiliation = unitdb.AffiliationFriendly
				} else if !classified[m.Target] {
					entry, _ := m.Target.GetEntry()
					if _, ok := knownHostiles[entry]; !ok {
						return nil, nil, errors.New("unknown pre-possession affiliation")
					}
					info.Affiliation = unitdb.AffiliationHostile
				}
				// Expired P1 control cannot affect the persisted egg-marker window.
				// Do not require irrelevant controller history or persist its temporary
				// affiliation as the player's underlying affiliation.
				if chosen.at.Add(chosen.duration).Before(window.Start) {
					units.ClearPossessed(m.Target)
				} else {
					if !m.Controller.IsPlayer() && !classified[*m.Controller] {
						entry, _ := m.Controller.GetEntry()
						if _, known := knownHostiles[entry]; !known {
							return nil, nil, errors.New("unknown possession controller affiliation")
						}
						units.Info[*m.Controller] = unitinfo.Info{Guid: *m.Controller, Affiliation: unitdb.AffiliationHostile}
					}
					// Reject chains rather than risking recursive classification cycles.
					if _, controlled := units.GetPossession(*m.Controller); controlled {
						return nil, nil, errors.New("unsupported possession controller chain")
					}
					units.SetPossessed(m.Target, *m.Controller, m.Spell, chosen.at, chosen.duration)
				}
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
			if !event.at.Before(window.Start) && !m.Target.IsPlayer() && m.Caster != nil && !m.Caster.IsPlayer() && !classified[*m.Caster] {
				recordRazorgoreOmission(report, c.ID, "damage", *m.Caster, combatmetrics.EffectiveDamage(m), "source ownership is not known at event time")
				continue
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
						recordRazorgoreOmission(report, c.ID, "damage", m.Target, combatmetrics.EffectiveDamage(m), "target ownership or hostility is not known at event time")
						continue
					}
				}
			}
			damage = append(damage, m)
		case *messages.Heal:
			if m.Amount < 0 || m.Overheal < 0 {
				return nil, nil, errors.New("invalid healing amount")
			}
			if !event.at.Before(window.Start) {
				amount := max(int64(m.Amount)-int64(m.Overheal), 0)
				if !m.Caster.IsPlayer() && !classified[m.Caster] {
					recordRazorgoreOmission(report, c.ID, "heal", m.Caster, amount, "source ownership is not known at event time")
					continue
				}
				if !m.Target.IsPlayer() && !classified[m.Target] {
					recordRazorgoreOmission(report, c.ID, "heal", m.Target, amount, "target ownership is not known at event time")
					continue
				}
			}
		case *messages.Absorbed:
			if m.Amount < 0 {
				return nil, nil, errors.New("invalid absorb amount")
			}
			if !event.at.Before(window.Start) {
				if !m.Caster.IsPlayer() && !classified[m.Caster] {
					recordRazorgoreOmission(report, c.ID, "absorbed", m.Caster, int64(m.Amount), "source ownership is not known at event time")
					continue
				}
				if !m.Target.IsPlayer() && !classified[m.Target] {
					recordRazorgoreOmission(report, c.ID, "absorbed", m.Target, int64(m.Amount), "target ownership is not known at event time")
					continue
				}
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
		// Historical derived HPS may use older targeting/overheal semantics.
		// It is an output to repair, not a completeness checksum for P2 inputs.
		// Complete framed streams and classified P2 units are required above.
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
