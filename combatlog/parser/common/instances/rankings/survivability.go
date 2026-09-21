package rankings

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

var (
	_ instancehook.Hook               = (*SurvivabilityTracker)(nil)
	_ instancehook.FightFinalizedHook = (*SurvivabilityTracker)(nil)
)

// PlayerSurvivability holds a player's death count and alive time for one encounter.
type PlayerSurvivability struct {
	Deaths            int32
	AliveDurationSecs float64
	AlivePercentage   float64
}

// SurvivabilityResult holds per-player survivability for one encounter.
type SurvivabilityResult struct {
	DurationSecs float64
	Players      map[guid.GUID]PlayerSurvivability
}

type lifeTransition struct {
	at   time.Time
	dead bool
}

type playerLifeState struct {
	deaths      int32
	dead        bool
	transitions []lifeTransition
}

// SurvivabilityTracker assumes players are alive when each fight starts, then
// tracks explicit death and resurrection transitions until the fight ends.
type SurvivabilityTracker struct {
	instancehook.BaseHook

	players map[guid.GUID]*playerLifeState
	results map[uuid.UUID]*SurvivabilityResult
}

func NewSurvivabilityTracker() *SurvivabilityTracker {
	return &SurvivabilityTracker{
		players: make(map[guid.GUID]*playerLifeState),
		results: make(map[uuid.UUID]*SurvivabilityResult),
	}
}

func (t *SurvivabilityTracker) FightStarted(_ uuid.UUID, _ messages.Message) {
	t.players = make(map[guid.GUID]*playerLifeState)
}

func (t *SurvivabilityTracker) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	if !active {
		return nil
	}

	switch msg := m.(type) {
	case *messages.Slain:
		if !msg.Victim.IsPlayer() {
			return nil
		}
		state := t.player(msg.Victim)
		if state.dead {
			return nil
		}
		state.deaths++
		state.dead = true
		state.transitions = append(state.transitions, lifeTransition{at: msg.Date(), dead: true})
	case *messages.Resurrection:
		if !msg.Target.IsPlayer() {
			return nil
		}
		state := t.player(msg.Target)
		if !state.dead {
			return nil
		}
		state.dead = false
		state.transitions = append(state.transitions, lifeTransition{at: msg.Date()})
	}

	return nil
}

func (t *SurvivabilityTracker) FightFinalized(encounterID uuid.UUID, start, end time.Time) {
	duration := end.Sub(start)
	if duration < 0 {
		duration = 0
	}

	result := &SurvivabilityResult{
		DurationSecs: duration.Seconds(),
		Players:      make(map[guid.GUID]PlayerSurvivability, len(t.players)),
	}
	for playerGUID, state := range t.players {
		var deadDuration time.Duration
		var deadSince *time.Time
		for _, transition := range state.transitions {
			at := transition.at
			if at.Before(start) {
				at = start
			}
			if at.After(end) {
				at = end
			}
			if transition.dead {
				if deadSince == nil {
					deadSince = &at
				}
				continue
			}
			if deadSince != nil {
				if at.After(*deadSince) {
					deadDuration += at.Sub(*deadSince)
				}
				deadSince = nil
			}
		}
		if deadSince != nil && end.After(*deadSince) {
			deadDuration += end.Sub(*deadSince)
		}
		if deadDuration > duration {
			deadDuration = duration
		}
		aliveDuration := duration - deadDuration
		if aliveDuration < 0 {
			aliveDuration = 0
		}

		alivePercentage := float64(0)
		if duration > 0 {
			alivePercentage = float64(aliveDuration) / float64(duration) * 100
		}
		result.Players[playerGUID] = PlayerSurvivability{
			Deaths:            state.deaths,
			AliveDurationSecs: aliveDuration.Seconds(),
			AlivePercentage:   alivePercentage,
		}
	}
	t.results[encounterID] = result
}

func (t *SurvivabilityTracker) Finalize(_ context.Context) error {
	return nil
}

func (t *SurvivabilityTracker) Result() map[uuid.UUID]*SurvivabilityResult {
	return t.results
}

func (t *SurvivabilityTracker) player(playerGUID guid.GUID) *playerLifeState {
	state, ok := t.players[playerGUID]
	if !ok {
		state = &playerLifeState{}
		t.players[playerGUID] = state
	}
	return state
}
