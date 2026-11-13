package serviceeventrepair

import (
	"errors"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"google.golang.org/protobuf/proto"
)

// Only protector-controlled players are supported here. Their Type remains
// Player throughout control, so DPSTracker still credits their damage to them
// and never credits damage against them. Creature control can change credit and
// target eligibility and must not pass the direct-player upper-bound path.
func validateLucifronControl(e razorgoreEvidence, c database.LogInstanceEncounter, events []razorgoreReplayEvent) error {
	casts, stamps, err := lucifronControlCasts(e, c)
	if err != nil {
		return err
	}
	hasControl := len(casts) > 0
	for _, event := range events {
		if m, ok := event.message.(*messages.UnitClassificationEvent); ok && m.Controller != nil {
			hasControl = true
		}
	}
	if !hasControl {
		return nil
	}
	if !e.Group.Format.Valid || e.Group.Format.LogFormat != database.LogFormat112aCcAddon {
		return errors.New("player control requires historical addon duration semantics")
	}
	// Aura and classification share global event indices. Check their ordering,
	// including ignored targetless casts, before matching a snapshot to its cast.
	timeline := append(slices.Clone(events), stamps...)
	slices.SortFunc(timeline, func(a, b razorgoreReplayEvent) int {
		if a.index < b.index {
			return -1
		}
		if a.index > b.index {
			return 1
		}
		return 0
	})
	for i := 1; i < len(timeline); i++ {
		if timeline[i].index == timeline[i-1].index || timeline[i].at.Before(timeline[i-1].at) {
			return errors.New("ambiguous control event chronology")
		}
	}
	units := unitdb.New()
	matched := map[int32]bool{}
	controllers := map[guid.GUID]bool{}
	for _, cast := range casts {
		controllers[cast.controller] = true
	}
	for _, event := range events {
		if err := units.ProcessMessage(event.message); err != nil {
			return err
		}
		m, ok := event.message.(*messages.UnitClassificationEvent)
		if !ok {
			continue
		}
		if controllers[m.Target] && (m.Owner != nil || m.Controller != nil || m.Affiliation == unitdb.AffiliationFriendly) {
			return errors.New("protector controller classification contradicts hostile unowned identity")
		}
		if m.Controller == nil {
			units.ClearPossessed(m.Target)
			continue
		}
		entry, _ := m.Controller.GetEntry()
		if !m.Target.IsPlayer() || m.Owner != nil || !m.Controller.IsCreature() || entry != 12119 || m.Spell == nil || m.Spell.ID != 20604 {
			return errors.New("unsupported Lucifron control target, controller, or spell")
		}
		var chosen *razorgoreControlCast
		for i := range casts {
			a := &casts[i]
			if a.index < event.index && !a.at.After(event.at) && a.target == m.Target && a.controller == *m.Controller && (chosen == nil || chosen.index < a.index) {
				chosen = a
			}
		}
		if chosen == nil || chosen.spellID != int32(m.Spell.ID) || event.at.After(chosen.at.Add(chosen.duration)) {
			return errors.New("controlled player snapshot lacks a live authoritative aura_cast")
		}
		if !matched[chosen.index] {
			// A first snapshot observed later cannot establish when control started or
			// whether unrecorded control crossed the encounter boundary.
			if !event.at.Equal(chosen.at) {
				return errors.New("control gain is missing its contemporaneous classification")
			}
			units.Info[m.Target] = unitinfo.Info{Guid: m.Target, IsPlayer: true, Affiliation: unitdb.AffiliationFriendly}
			units.Info[*m.Controller] = unitinfo.Info{Guid: *m.Controller, Affiliation: unitdb.AffiliationHostile}
			units.SetPossessed(m.Target, *m.Controller, m.Spell, chosen.at, chosen.duration)
			matched[chosen.index] = true
		} else {
			// Never renew expiry from a repeated snapshot or resurrect cleared control.
			active, ok := units.GetPossession(m.Target)
			if !ok || active.Controller != *m.Controller || !active.StartTime.Equal(chosen.at) {
				return errors.New("control snapshot contradicts expiry or release history")
			}
		}
	}
	for _, cast := range casts {
		if !matched[cast.index] {
			return errors.New("control aura_cast is missing its classification evidence")
		}
	}
	return nil
}

// Uses the same persisted duration and cast representation as Razorgore, but
// preserves the parser's targetless AuraCast behavior (synthetic/possession.go):
// a nil target produces no PossessionChange and must not be assigned a victim.
func lucifronControlCasts(e razorgoreEvidence, c database.LogInstanceEncounter) ([]razorgoreControlCast, []razorgoreReplayEvent, error) {
	var casts []razorgoreControlCast
	var stamps []razorgoreReplayEvent
	found := false
	for _, row := range e.Events {
		if row.Type != database.LogInstanceEventTypeAuraCast {
			continue
		}
		if found || row.InstanceID != e.Instance.ID {
			return nil, nil, errors.New("duplicate or unrelated aura_cast stream")
		}
		found = true
		raw, err := razorgoreFrame(row.Events, c.ID, c.StartTime.Time)
		if err != nil {
			return nil, nil, err
		}
		previous := int32(-1)
		for _, b := range raw {
			var a chronicleproto.AuraCast
			if err := proto.Unmarshal(b, &a); err != nil {
				return nil, nil, err
			}
			if a.Meta == nil || a.Meta.IsSynthetic || a.Meta.Index <= previous || a.Meta.OffsetMilli < 0 || a.Meta.OffsetMilli > c.EndTime.Time.Sub(c.StartTime.Time).Milliseconds() {
				return nil, nil, errors.New("invalid aura_cast control metadata")
			}
			previous = a.Meta.Index
			at := c.StartTime.Time.Add(time.Duration(a.Meta.OffsetMilli) * time.Millisecond)
			stamps = append(stamps, razorgoreReplayEvent{index: a.Meta.Index, at: at})
			if a.Target == nil || a.EffectAuraName != 2 && a.EffectAuraName != 6 {
				continue
			}
			target, err := guid.FromString(*a.Target)
			if err != nil || target.IsZero() {
				return nil, nil, errors.New("invalid control target")
			}
			controller, err := guid.FromString(a.Caster)
			if err != nil || controller.IsZero() {
				return nil, nil, errors.New("invalid control caster")
			}
			if target == controller {
				continue
			} // The possession synthesizer ignores self-casts.
			entry, _ := controller.GetEntry()
			if !target.IsPlayer() || entry != 12119 || !controller.IsCreature() || a.Spell == nil || a.Spell.Id != 20604 || a.DurationMS <= 0 {
				return nil, nil, errors.New("unsupported player control aura or missing authoritative duration")
			}
			casts = append(casts, razorgoreControlCast{index: a.Meta.Index, spellID: a.Spell.Id, at: at, target: target, controller: controller, duration: time.Duration(a.DurationMS) * time.Millisecond})
		}
	}
	return casts, stamps, nil
}
