package companion

import (
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
)

// State is the complete companion semantic DTO, including unfinished framing.
// PlayerData uses a strict typed JSON clone to detach every nested mutable field.
type State struct {
	Assembly       int
	Buffer         string
	Counter        byte
	DecodedOrdinal uint64
	Players        map[guid.GUID]*PlayerData
	AddonVersion   string
	RealmClock     *realmclock.Info
	SawRaidGroup   bool
}

func (s State) validate() error {
	if s.Assembly != int(stateIdle) && s.Assembly != int(stateAccumulating) {
		return fmt.Errorf("invalid companion assembly state")
	}
	if s.Counter != 0 && (s.Counter < '0' || s.Counter > '9') {
		return fmt.Errorf("invalid companion counter")
	}
	if s.Assembly == int(stateAccumulating) && s.Counter == 0 {
		return fmt.Errorf("missing companion counter")
	}
	if s.Assembly == int(stateIdle) && s.Buffer != "" {
		return fmt.Errorf("idle companion buffer is not empty")
	}
	if s.Players == nil {
		return fmt.Errorf("missing companion players")
	}
	for id, p := range s.Players {
		if p == nil || p.GUID != id {
			return fmt.Errorf("invalid companion player %v", id)
		}
	}
	return nil
}

func cloneState(s State) (State, error) {
	if err := s.validate(); err != nil {
		return State{}, err
	}
	data, err := json.Marshal(s)
	if err != nil {
		return State{}, err
	}
	return DecodeState(StateVersion, data)
}

func (p *Parser) CaptureState() (State, error) {
	return cloneState(State{Assembly: int(p.state), Buffer: p.buffer.String(), Counter: p.counter,
		DecodedOrdinal: p.decodedOrdinal, Players: p.players, AddonVersion: p.addonVersion,
		RealmClock: p.realmClock, SawRaidGroup: p.sawRaidGroup})
}

func (s State) Restore() (*Parser, error) {
	c, err := cloneState(s)
	if err != nil {
		return nil, err
	}
	p := &Parser{state: assemblyState(c.Assembly), counter: c.Counter, decodedOrdinal: c.DecodedOrdinal,
		players: c.Players, addonVersion: c.AddonVersion, realmClock: c.RealmClock, sawRaidGroup: c.SawRaidGroup}
	p.buffer.WriteString(c.Buffer)
	return p, nil
}

// WireRuntime attaches logging only; semantic restoration does not emit logs.
func (p *Parser) WireRuntime(logger *slog.Logger) { p.logger = logger }

const StateVersion = 1

func (s State) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(s)
}

func DecodeState(version int, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported companion state version %d", version)
	}
	var state State
	if err := cleu.DecodeStateValue(payload, &state); err != nil {
		return State{}, err
	}
	if err := state.validate(); err != nil {
		return State{}, err
	}
	return state, nil
}
