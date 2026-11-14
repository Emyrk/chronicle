package zoner

import "github.com/Emyrk/chronicle/internal/stategraph/ownergraph"

func RegisterGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[Location]{Type: "zoner.Location", Version: StateVersion, Init: func() *Location { return new(Location) }, Capture: func(l *Location, _ *ownergraph.Capture) ([]byte, error) { return l.CaptureState().Encode() }, Restore: func(l *Location, v uint32, b []byte, _ *ownergraph.Restore) error {
		s, e := DecodeState(v, b)
		if e != nil {
			return e
		}
		*l = *s.Restore()
		return nil
	}})
}
