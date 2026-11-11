package creatures

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

const WorgPupCapturesStateType = "vanilla.WorgPupCaptures"
const WorgPupCapturesStateVersion uint32 = 1

type WorgPupCapturesState struct {
	count     int
	touchedAt time.Time
}

// InitWorgPupCaptures allocates one graph owner without publishing it to the
// Characters shared-state map. Graph restoration must reuse this same object.
func InitWorgPupCaptures() *worgPupCaptures { return new(worgPupCaptures) }

func (c *worgPupCaptures) CaptureState() (WorgPupCapturesState, error) {
	if c == nil {
		return WorgPupCapturesState{}, fmt.Errorf("nil worg captures")
	}
	return WorgPupCapturesState{count: c.count, touchedAt: c.touchedAt}, nil
}
func (s WorgPupCapturesState) Encode() ([]byte, error) {
	return json.Marshal(struct {
		Count     int       `json:"count"`
		TouchedAt time.Time `json:"touched_at"`
	}{s.count, s.touchedAt})
}
func DecodeWorgPupCapturesState(version uint32, payload []byte) (WorgPupCapturesState, error) {
	if version != WorgPupCapturesStateVersion {
		return WorgPupCapturesState{}, fmt.Errorf("unsupported worg captures version")
	}
	d := json.NewDecoder(bytes.NewReader(payload))
	token, err := d.Token()
	if err != nil {
		return WorgPupCapturesState{}, err
	}
	if token != json.Delim('{') {
		return WorgPupCapturesState{}, fmt.Errorf("worg captures must be object")
	}
	var s WorgPupCapturesState
	seen := map[string]bool{}
	for d.More() {
		token, err := d.Token()
		if err != nil {
			return WorgPupCapturesState{}, err
		}
		key := token.(string)
		if seen[key] {
			return WorgPupCapturesState{}, fmt.Errorf("duplicate worg captures field")
		}
		seen[key] = true
		switch key {
		case "count":
			var v *int
			if err := d.Decode(&v); err != nil {
				return WorgPupCapturesState{}, err
			}
			if v == nil {
				return WorgPupCapturesState{}, fmt.Errorf("null count")
			}
			s.count = *v
		case "touched_at":
			var v *time.Time
			if err := d.Decode(&v); err != nil {
				return WorgPupCapturesState{}, err
			}
			if v == nil {
				return WorgPupCapturesState{}, fmt.Errorf("null touched_at")
			}
			s.touchedAt = *v
		default:
			return WorgPupCapturesState{}, fmt.Errorf("unknown worg captures field")
		}
	}
	if _, err := d.Token(); err != nil {
		return WorgPupCapturesState{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return WorgPupCapturesState{}, fmt.Errorf("trailing worg captures state")
	}
	if len(seen) != 2 || s.count < 0 {
		return WorgPupCapturesState{}, fmt.Errorf("incomplete or invalid worg captures state")
	}
	return s, nil
}
func (c *worgPupCaptures) RestoreState(s WorgPupCapturesState) error {
	if c == nil || s.count < 0 {
		return fmt.Errorf("invalid worg captures destination/state")
	}
	*c = worgPupCaptures(s)
	return nil
}

func (c *BloodaxeWorgPup) CaptureState(capture func(*characters.Common) (string, error)) (CommonOwnerState, error) {
	if c == nil || c.all == nil {
		return CommonOwnerState{}, fmt.Errorf("missing BloodaxeWorgPup/dependency")
	}
	return captureCommonOwner("BloodaxeWorgPup", c.Common, capture)
}

// RestoreState neither loads nor resets capture state. The Characters graph
// owns that shared reference and must restore it separately, once.
func (c *BloodaxeWorgPup) RestoreState(s CommonOwnerState, all *characters.Characters, resolve func(string) (*characters.Common, error)) error {
	if c == nil || all == nil {
		return fmt.Errorf("missing BloodaxeWorgPup destination/dependency")
	}
	common, err := s.resolve("BloodaxeWorgPup", resolve)
	if err != nil {
		return err
	}
	*c = BloodaxeWorgPup{Common: common, all: all}
	return nil
}
