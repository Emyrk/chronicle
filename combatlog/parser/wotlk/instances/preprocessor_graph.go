package instances

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	common "github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// These owners retain no messages, callbacks, or external mutable dependencies.
// Their ProcessMessage methods continue to mutate the caller's canonical message
// in place. Static rules come from this executable, not from archive data.
const preprocessorStateVersion uint32 = 1

type MalygosDamageCreditState struct {
	Caster          guid.GUID `json:"caster"`
	CasterExpiresAt time.Time `json:"caster_expires_at"`
}

func (m *malygosDamageCredit) CaptureState() MalygosDamageCreditState {
	return MalygosDamageCreditState{m.caster, m.casterExpiresAt}
}
func (m *malygosDamageCredit) RestoreState(s MalygosDamageCreditState) error {
	// Slain with a zero victim can legitimately leave zero caster plus expiry;
	// preserve it rather than inventing a stricter invariant than the parser.
	if !s.Caster.IsZero() {
		entry, ok := s.Caster.GetEntry()
		if !s.Caster.IsCreature() || !ok || entry != malygosEntry {
			return fmt.Errorf("invalid Malygos caster")
		}
	}
	m.caster, m.casterExpiresAt = s.Caster, s.CasterExpiresAt
	return nil
}

type IcecrownScriptedActivityState struct {
	GunshipVictoryAt time.Time `json:"gunship_victory_at"`
}

func (p *icecrownScriptedActivity) CaptureState() IcecrownScriptedActivityState {
	return IcecrownScriptedActivityState{p.gunshipVictoryAt}
}
func (p *icecrownScriptedActivity) RestoreState(s IcecrownScriptedActivityState) {
	p.gunshipVictoryAt = s.GunshipVictoryAt
}

// decodePreprocessorState rejects missing, null, duplicate and unknown fields.
func decodePreprocessorState(version uint32, data []byte, dest any, fields ...string) error {
	if version != preprocessorStateVersion {
		return fmt.Errorf("unsupported preprocessor state version %d", version)
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	tok, err := dec.Token()
	if err != nil || tok != json.Delim('{') {
		return fmt.Errorf("expected preprocessor state object")
	}
	seen := make(map[string]bool, len(fields))
	for dec.More() {
		key, err := dec.Token()
		if err != nil {
			return err
		}
		name, ok := key.(string)
		if !ok || seen[name] {
			return fmt.Errorf("invalid/duplicate preprocessor field")
		}
		allowed := false
		for _, field := range fields {
			if name == field {
				allowed = true
			}
		}
		if !allowed {
			return fmt.Errorf("unknown preprocessor field %q", name)
		}
		var value json.RawMessage
		if err := dec.Decode(&value); err != nil {
			return err
		}
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return fmt.Errorf("null preprocessor field %q", name)
		}
		seen[name] = true
	}
	if _, err := dec.Token(); err != nil {
		return err
	}
	if len(seen) != len(fields) {
		return fmt.Errorf("missing preprocessor state fields")
	}
	if _, err := dec.Token(); err != io.EOF {
		return fmt.Errorf("trailing preprocessor state data")
	}
	return json.Unmarshal(data, dest)
}

func RegisterSartharionPreprocessorGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[sartharionDrakePowerActivity]{
		Type: "wotlk.sartharionDrakePowerActivity", Version: preprocessorStateVersion,
		Init:    func() *sartharionDrakePowerActivity { return new(sartharionDrakePowerActivity) },
		Capture: func(*sartharionDrakePowerActivity, *ownergraph.Capture) ([]byte, error) { return []byte("{}"), nil },
		Restore: func(_ *sartharionDrakePowerActivity, v uint32, b []byte, _ *ownergraph.Restore) error {
			return decodePreprocessorState(v, b, &struct{}{})
		},
	})
}
func RegisterThorimPreprocessorGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[thorimArenaStarterCombat]{
		Type: "wotlk.thorimArenaStarterCombat", Version: preprocessorStateVersion,
		Init:    func() *thorimArenaStarterCombat { return new(thorimArenaStarterCombat) },
		Capture: func(*thorimArenaStarterCombat, *ownergraph.Capture) ([]byte, error) { return []byte("{}"), nil },
		Restore: func(_ *thorimArenaStarterCombat, v uint32, b []byte, _ *ownergraph.Restore) error {
			return decodePreprocessorState(v, b, &struct{}{})
		},
	})
}
func RegisterMalygosPreprocessorGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[malygosDamageCredit]{
		Type: "wotlk.malygosDamageCredit", Version: preprocessorStateVersion,
		Init: func() *malygosDamageCredit { return new(malygosDamageCredit) },
		Capture: func(p *malygosDamageCredit, _ *ownergraph.Capture) ([]byte, error) {
			return json.Marshal(p.CaptureState())
		},
		Restore: func(p *malygosDamageCredit, v uint32, b []byte, _ *ownergraph.Restore) error {
			var state MalygosDamageCreditState
			if err := decodePreprocessorState(v, b, &state, "caster", "caster_expires_at"); err != nil {
				return err
			}
			return p.RestoreState(state)
		},
	})
}
func RegisterIcecrownPreprocessorGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[icecrownScriptedActivity]{
		Type: "wotlk.icecrownScriptedActivity", Version: preprocessorStateVersion,
		Init: func() *icecrownScriptedActivity { return new(icecrownScriptedActivity) },
		Capture: func(p *icecrownScriptedActivity, _ *ownergraph.Capture) ([]byte, error) {
			return json.Marshal(p.CaptureState())
		},
		Restore: func(p *icecrownScriptedActivity, v uint32, b []byte, _ *ownergraph.Restore) error {
			var state IcecrownScriptedActivityState
			if err := decodePreprocessorState(v, b, &state, "gunship_victory_at"); err != nil {
				return err
			}
			p.RestoreState(state)
			return nil
		},
	})
}

func SartharionPreprocessorGraphRecipe() common.PreprocessorGraphRecipe {
	return common.PreprocessorGraphRecipe{ID: "wotlk.sartharionDrakePowerActivity", New: func() instancehook.Preprocessor { return new(sartharionDrakePowerActivity) }, Validate: func(p instancehook.Preprocessor) bool {
		v, ok := p.(*sartharionDrakePowerActivity)
		return ok && v != nil
	}}
}
func ThorimPreprocessorGraphRecipe() common.PreprocessorGraphRecipe {
	return common.PreprocessorGraphRecipe{ID: "wotlk.thorimArenaStarterCombat", New: func() instancehook.Preprocessor { return new(thorimArenaStarterCombat) }, Validate: func(p instancehook.Preprocessor) bool { v, ok := p.(*thorimArenaStarterCombat); return ok && v != nil }}
}
func MalygosPreprocessorGraphRecipe() common.PreprocessorGraphRecipe {
	return common.PreprocessorGraphRecipe{ID: "wotlk.malygosDamageCredit", New: func() instancehook.Preprocessor { return new(malygosDamageCredit) }, Validate: func(p instancehook.Preprocessor) bool { v, ok := p.(*malygosDamageCredit); return ok && v != nil }}
}
func IcecrownPreprocessorGraphRecipe() common.PreprocessorGraphRecipe {
	return common.PreprocessorGraphRecipe{ID: "wotlk.icecrownScriptedActivity", New: func() instancehook.Preprocessor { return new(icecrownScriptedActivity) }, Validate: func(p instancehook.Preprocessor) bool { v, ok := p.(*icecrownScriptedActivity); return ok && v != nil }}
}
