package rankings

import (
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// RegisterSurvivabilityGraphOwner reuses the owner-local codec without finalization.
func RegisterSurvivabilityGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[SurvivabilityTracker]{Type: SurvivabilityTrackerStateType, Version: SurvivabilityTrackerStateVersion, Init: func() *SurvivabilityTracker { return new(SurvivabilityTracker) },
		Capture: func(t *SurvivabilityTracker, _ *ownergraph.Capture) ([]byte, error) {
			s, err := t.CaptureState()
			if err != nil {
				return nil, err
			}
			return s.Encode()
		},
		Restore: func(t *SurvivabilityTracker, v uint32, b []byte, _ *ownergraph.Restore) error {
			s, err := DecodeSurvivabilityTrackerState(v, b)
			if err != nil {
				return err
			}
			fresh, err := s.Restore()
			if err != nil {
				return err
			}
			*t = *fresh
			return nil
		}})
}
