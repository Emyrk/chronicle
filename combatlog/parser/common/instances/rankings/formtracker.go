package rankings

import (
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// druidForm is a ranking-relevant player form observed in combat logs.
type druidForm uint8

const (
	druidFormUnknown druidForm = iota
	druidFormCat
	druidFormBear
)

func (f druidForm) String() string {
	switch f {
	case druidFormCat:
		return "Cat"
	case druidFormBear:
		return "Bear"
	default:
		return ""
	}
}

type formState struct {
	active        druidForm
	activeSince   time.Time
	catDuration   time.Duration
	bearDuration  time.Duration
	catSeen       bool
	bearSeen      bool
	startedInForm druidForm
}

// druidFormTracker records ranking-relevant player forms across encounters. It is
// owned and driven directly by DPSTracker rather than registered as a separate
// instance hook, so both trackers share the same encounter lifecycle.
type druidFormTracker struct {
	current        map[guid.GUID]druidForm
	encounter      map[guid.GUID]*formState
	fightStartedAt time.Time
}

func newDruidFormTracker() *druidFormTracker {
	return &druidFormTracker{
		current:   make(map[guid.GUID]druidForm),
		encounter: make(map[guid.GUID]*formState),
	}
}

func (t *druidFormTracker) FightStarted(m messages.Message) {
	t.encounter = make(map[guid.GUID]*formState)
	t.fightStartedAt = time.Time{}
	if m == nil {
		return
	}

	t.fightStartedAt = m.Date()
	for unit, form := range t.current {
		state := &formState{
			active:        form,
			activeSince:   m.Date(),
			startedInForm: form,
		}
		state.markSeen(form)
		t.encounter[unit] = state
	}
}

func (t *druidFormTracker) ProcessMessage(active bool, m messages.Message) {
	switch msg := m.(type) {
	case *messages.Aura:
		t.processAura(active, msg)
	case *messages.Slain:
		t.processSlain(active, msg)
	}
}

// FightFinalized corrects form durations to the materialized fight boundary.
// FightStarted receives the message that triggered detection, which can be later
// than an authoritative encounter boundary or character activity start.
func (t *druidFormTracker) FightFinalized(start time.Time) {
	if t.fightStartedAt.IsZero() || !start.Before(t.fightStartedAt) {
		return
	}

	missing := t.fightStartedAt.Sub(start)
	for _, state := range t.encounter {
		state.addDuration(state.startedInForm, missing)
	}
}

func (t *druidFormTracker) Dominant(unit guid.GUID, fightEnd time.Time) druidForm {
	state := t.encounter[unit]
	if state == nil {
		return druidFormUnknown
	}

	catDuration := state.catDuration
	bearDuration := state.bearDuration
	if state.active != druidFormUnknown && !fightEnd.IsZero() && !state.activeSince.IsZero() && !fightEnd.Before(state.activeSince) {
		duration := fightEnd.Sub(state.activeSince)
		switch state.active {
		case druidFormCat:
			catDuration += duration
		case druidFormBear:
			bearDuration += duration
		}
	}

	if state.catSeen && !state.bearSeen {
		return druidFormCat
	}
	if state.bearSeen && !state.catSeen {
		return druidFormBear
	}
	if catDuration > bearDuration {
		return druidFormCat
	}
	if bearDuration > catDuration {
		return druidFormBear
	}
	return druidFormUnknown
}

func (t *druidFormTracker) processAura(active bool, msg *messages.Aura) {
	form := druidFormFromAura(msg)
	if form == druidFormUnknown {
		return
	}

	if auraRemoved(msg) {
		if t.current[msg.Target] == form {
			delete(t.current, msg.Target)
		}
	} else if auraApplied(msg) {
		t.current[msg.Target] = form
	} else {
		return
	}

	if !active {
		return
	}
	state := t.encounter[msg.Target]
	if state == nil {
		state = &formState{}
		t.encounter[msg.Target] = state
	}

	at := msg.Date()
	if auraRemoved(msg) {
		if state.active == form {
			state.addActiveDuration(at)
			state.active = druidFormUnknown
			state.activeSince = time.Time{}
		}
		return
	}

	state.markSeen(form)
	if state.active == form {
		return
	}
	state.addActiveDuration(at)
	state.active = form
	state.activeSince = at
}

func (t *druidFormTracker) processSlain(active bool, msg *messages.Slain) {
	delete(t.current, msg.Victim)
	if !active {
		return
	}
	if state := t.encounter[msg.Victim]; state != nil {
		state.addActiveDuration(msg.Date())
		state.active = druidFormUnknown
		state.activeSince = time.Time{}
	}
}

func (s *formState) markSeen(form druidForm) {
	switch form {
	case druidFormCat:
		s.catSeen = true
	case druidFormBear:
		s.bearSeen = true
	}
}

func (s *formState) addActiveDuration(until time.Time) {
	if s.active == druidFormUnknown || s.activeSince.IsZero() || until.Before(s.activeSince) {
		return
	}
	s.addDuration(s.active, until.Sub(s.activeSince))
}

func (s *formState) addDuration(form druidForm, duration time.Duration) {
	switch form {
	case druidFormCat:
		s.catDuration += duration
	case druidFormBear:
		s.bearDuration += duration
	}
}

func auraApplied(msg *messages.Aura) bool {
	return msg.State == types.AuraStateAdded || msg.State == types.AuraStateModified ||
		msg.Transition == messages.AuraTransitionApplied || msg.Transition == messages.AuraTransitionRefreshed ||
		msg.Application == types.AuraApplicationGains
}

func auraRemoved(msg *messages.Aura) bool {
	return msg.State == types.AuraStateRemoved || msg.Transition == messages.AuraTransitionRemoved ||
		msg.Application == types.AuraApplicationFades || msg.Application == types.AuraApplicationRemoved
}

func druidFormFromAura(msg *messages.Aura) druidForm {
	return identifyDruidForm(msg.SpellName, msg.SpellData)
}

func identifyDruidForm(name string, spell *chrondbc.Spell) druidForm {
	if name == "" && spell != nil {
		name = spell.Name_lang.String()
	}
	switch {
	case strings.EqualFold(name, "Cat Form"):
		return druidFormCat
	case strings.EqualFold(name, "Bear Form"), strings.EqualFold(name, "Dire Bear Form"):
		return druidFormBear
	default:
		return druidFormUnknown
	}
}
