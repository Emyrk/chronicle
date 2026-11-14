package instances

import (
	"encoding/json"
	"fmt"
	"time"

	common "github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type xtObservationValue struct {
	At         time.Time               `json:"at"`
	Unit       guid.GUID               `json:"unit"`
	HeartBreak bool                    `json:"heart_break"`
	HeartDeath bool                    `json:"heart_death"`
	Transition messages.AuraTransition `json:"transition"`
}
type xtEvidenceValue struct {
	Observations []xtObservationValue `json:"observations"`
}

func (v xtEvidenceValue) validate() error {
	for _, o := range v.Observations {
		entry, ok := o.Unit.GetEntry()
		if !ok {
			return fmt.Errorf("invalid XT evidence GUID")
		}
		if o.HeartDeath {
			if o.HeartBreak || o.Transition != 0 || (entry != 33329 && entry != 33995) {
				return fmt.Errorf("invalid XT heart death observation")
			}
		} else {
			if o.Transition != messages.AuraTransitionApplied && o.Transition != messages.AuraTransitionRemoved {
				return fmt.Errorf("invalid XT aura transition")
			}
			if o.HeartBreak {
				if entry != 33293 && entry != 33885 {
					return fmt.Errorf("invalid XT Heartbreak target")
				}
			} else if entry != 33329 && entry != 33995 {
				return fmt.Errorf("invalid XT exposed heart target")
			}
		}
	}
	return nil
}
func RegisterXTVariantPreprocessorGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[xtVariantEvidence]{Type: "wotlk.xtVariantEvidence", Version: 1, Init: func() *xtVariantEvidence { return new(xtVariantEvidence) },
		Capture: func(e *xtVariantEvidence, _ *ownergraph.Capture) ([]byte, error) {
			var v xtEvidenceValue
			if e.observations != nil {
				v.Observations = make([]xtObservationValue, len(e.observations))
			}
			for i, o := range e.observations {
				v.Observations[i] = xtObservationValue{o.at, o.unit, o.heartBreak, o.heartDeath, o.transition}
			}
			if err := v.validate(); err != nil {
				return nil, err
			}
			return json.Marshal(v)
		}, Restore: func(e *xtVariantEvidence, version uint32, b []byte, _ *ownergraph.Restore) error {
			if version != 1 {
				return fmt.Errorf("unsupported XT evidence version")
			}
			var v xtEvidenceValue
			if err := cleu.DecodeStateValue(b, &v); err != nil {
				return err
			}
			if err := v.validate(); err != nil {
				return err
			}
			if v.Observations != nil {
				e.observations = make([]xtAuraEvidence, len(v.Observations))
			}
			for i, o := range v.Observations {
				e.observations[i] = xtAuraEvidence{o.At, o.Unit, o.HeartBreak, o.HeartDeath, o.Transition}
			}
			return nil
		}})
}
func XTVariantPreprocessorGraphRecipe() common.PreprocessorGraphRecipe {
	return common.PreprocessorGraphRecipe{ID: "wotlk.xtVariantEvidence", New: func() instancehook.Preprocessor { return new(xtVariantEvidence) }, Validate: func(p instancehook.Preprocessor) bool { v, ok := p.(*xtVariantEvidence); return ok && v != nil }}
}
func UlduarEncounterVariantGraphRecipe() *common.EncounterVariantGraphRecipe {
	return &common.EncounterVariantGraphRecipe{ID: "wotlk/ulduar-variant/v1", Classify: ulduarEncounterVariant}
}
