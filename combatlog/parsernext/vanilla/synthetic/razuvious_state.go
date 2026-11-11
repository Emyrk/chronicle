package synthetic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// These identify one owned graph value, not a pipeline snapshot or archive.
const RazuviousStateType = "parsernext/vanilla/synthetic.RazuviousOverkill"
const RazuviousStateVersion uint32 = 1

// RazuviousState is an immutable scalar capture. Its zero value is inactive.
// Capture/restore do not expire the window; only processing a Damage does that.
// The enclosing session owns complete-file eligibility and graph validation.
type RazuviousState struct {
	lastSlain time.Time
	raz       guid.GUID
}

func (r *RazuviousOverkill) CaptureState() RazuviousState {
	return RazuviousState{lastSlain: r.lastSlain, raz: r.raz}
}

func (s RazuviousState) Encode() ([]byte, error) {
	return json.Marshal(struct {
		LastSlain time.Time `json:"last_slain"`
		Razuvious guid.GUID `json:"razuvious"`
	}{LastSlain: s.lastSlain, Razuvious: s.raz})
}

func DecodeRazuviousState(version uint32, payload []byte) (RazuviousState, error) {
	if version != RazuviousStateVersion {
		return RazuviousState{}, fmt.Errorf("unsupported %s version %d", RazuviousStateType, version)
	}
	var value struct {
		LastSlain *time.Time `json:"last_slain"`
		Razuvious *guid.GUID `json:"razuvious"`
	}
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&value); err != nil {
		return RazuviousState{}, fmt.Errorf("decode Razuvious state: %w", err)
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return RazuviousState{}, fmt.Errorf("trailing Razuvious state data")
	}
	if value.LastSlain == nil || value.Razuvious == nil {
		return RazuviousState{}, fmt.Errorf("missing or null Razuvious state field")
	}
	s := RazuviousState{lastSlain: *value.LastSlain, raz: *value.Razuvious}
	if err := s.validate(); err != nil {
		return RazuviousState{}, err
	}
	return s, nil
}

func (s RazuviousState) validate() error {
	if s.raz == 0 {
		if !s.lastSlain.IsZero() {
			return fmt.Errorf("inactive Razuvious state has death timestamp")
		}
	} else if entry, ok := s.raz.GetEntry(); !ok || entry != 16061 {
		return fmt.Errorf("invalid Razuvious state: non-Razuvious GUID %s", s.raz)
	}
	// An active window with a zero death timestamp is allowed: ProcessMessages
	// accepts a matching Slain at any timestamp, including zero or future time.
	return nil
}

func (s RazuviousState) Restore() (*RazuviousOverkill, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return &RazuviousOverkill{lastSlain: s.lastSlain, raz: s.raz}, nil
}
