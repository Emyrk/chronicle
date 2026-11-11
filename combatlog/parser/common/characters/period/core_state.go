package period

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const CoreStateType = "period.WorkingPeriodCore"
const CoreStateVersion uint32 = 1

// CoreState owns only WorkingPeriod's local activity state. Concrete period
// owners encode metadata explicitly; metadata and hooks are not serialized here.
type CoreState struct{ value coreValue }
type coreValue struct {
	Me         guid.GUID `json:"me"`
	Start      string    `json:"start"`
	End        string    `json:"end"`
	LastActive string    `json:"last_active"`
	EndState   EndState  `json:"end_state"`
}

func (p *WorkingPeriod[M]) CaptureCoreState(moments func(*Moment) (string, error)) (CoreState, error) {
	if p == nil || p.Period == nil || p.Meta == nil {
		return CoreState{}, fmt.Errorf("incomplete working period")
	}
	s, e := capturePeriod(periodValue{Me: p.me}, p.Period, moments)
	if e != nil {
		return CoreState{}, e
	}
	v := s.value
	return CoreState{coreValue{v.Me, v.Start, v.End, v.LastActive, v.EndState}}, nil
}
func (s CoreState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeCoreState(version uint32, payload []byte) (CoreState, error) {
	if version != CoreStateVersion {
		return CoreState{}, fmt.Errorf("unsupported working period core version")
	}
	var v coreValue
	if e := decodeComplete(payload, &v); e != nil {
		return CoreState{}, e
	}
	return CoreState{v}, nil
}

// RestoreCoreState accepts explicit typed metadata without modifying it. All
// references resolve before assignment; hooks remain unwired until composition.
func (p *WorkingPeriod[M]) RestoreCoreState(s CoreState, meta *M, moments func(string) (*Moment, error)) error {
	if p == nil || meta == nil {
		return fmt.Errorf("missing working period destination/metadata")
	}
	v := s.value
	base, e := (State{periodValue{Start: v.Start, End: v.End, LastActive: v.LastActive, EndState: v.EndState}}).restoreMoments(moments)
	if e != nil {
		return e
	}
	*p = WorkingPeriod[M]{Period: base, me: v.Me, Meta: meta}
	return nil
}
