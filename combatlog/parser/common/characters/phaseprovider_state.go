package characters

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
)

const PhaseProviderCharacterStateType = "characters.PhaseProviderCharacter"
const PhaseProviderCharacterStateVersion uint32 = 1

type PhaseProviderCharacterState struct{ value phaseProviderCharacterValue }
type phaseProviderCharacterValue struct {
	Character string `json:"character"`
	Provider  string `json:"provider"`
}

func InitPhaseProviderCharacter() *phaseProviderCharacter { return new(phaseProviderCharacter) }
func (c *phaseProviderCharacter) CaptureState(character func(Character) (string, error), provider func(phases.PhaseProvider) (string, error)) (PhaseProviderCharacterState, error) {
	if c == nil || nilReference(c.Character) || nilReference(c.provider) || character == nil || provider == nil {
		return PhaseProviderCharacterState{}, fmt.Errorf("missing phase provider dependencies")
	}
	ch, e := character(c.Character)
	if e != nil {
		return PhaseProviderCharacterState{}, e
	}
	p, e := provider(c.provider)
	if e != nil {
		return PhaseProviderCharacterState{}, e
	}
	if ch == "" || p == "" {
		return PhaseProviderCharacterState{}, fmt.Errorf("empty phase provider references")
	}
	return PhaseProviderCharacterState{phaseProviderCharacterValue{ch, p}}, nil
}
func (s PhaseProviderCharacterState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodePhaseProviderCharacterState(version uint32, payload []byte) (PhaseProviderCharacterState, error) {
	if version != PhaseProviderCharacterStateVersion {
		return PhaseProviderCharacterState{}, fmt.Errorf("unsupported phase provider version")
	}
	var v phaseProviderCharacterValue
	if e := decodeCharacterValue(payload, &v); e != nil {
		return PhaseProviderCharacterState{}, e
	}
	if v.Character == "" || v.Provider == "" {
		return PhaseProviderCharacterState{}, fmt.Errorf("empty phase provider references")
	}
	return PhaseProviderCharacterState{v}, nil
}

// RestoreState reconnects canonical owners; it never calls PhaseDefinitions.
func (c *phaseProviderCharacter) RestoreState(s PhaseProviderCharacterState, character func(string) (Character, error), provider func(string) (phases.PhaseProvider, error)) error {
	if c == nil || character == nil || provider == nil || s.value.Character == "" || s.value.Provider == "" {
		return fmt.Errorf("missing phase provider destination/dependencies")
	}
	ch, e := character(s.value.Character)
	if e != nil {
		return e
	}
	if nilReference(ch) {
		return fmt.Errorf("nil character")
	}
	p, e := provider(s.value.Provider)
	if e != nil {
		return e
	}
	if nilReference(p) {
		return fmt.Errorf("nil phase provider")
	}
	*c = phaseProviderCharacter{Character: ch, provider: p}
	return nil
}
