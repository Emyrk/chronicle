package period

import (
	"encoding/json"
	"fmt"
	"reflect"
)

const CollectorStateType = "period.PeriodCollector"
const CollectorStateVersion uint32 = 1

// CollectorState preserves ordered history references; current is still the
// final history element. Period objects are canonical caller-owned graph Values.
type CollectorState struct{ value collectorValue }
type collectorValue struct {
	History []string `json:"history"`
}

func (pc *PeriodCollector[M]) CaptureState(capture func(M) (string, error)) (CollectorState, error) {
	if pc == nil {
		return CollectorState{}, fmt.Errorf("nil period collector")
	}
	v := collectorValue{}
	if pc.History != nil {
		v.History = make([]string, len(pc.History))
	}
	for index, p := range pc.History {
		if capture == nil || nilPeriod(p) {
			return CollectorState{}, fmt.Errorf("missing period or capture")
		}
		ref, err := capture(p)
		if err != nil {
			return CollectorState{}, err
		}
		if ref == "" {
			return CollectorState{}, fmt.Errorf("empty period reference")
		}
		v.History[index] = ref
	}
	return CollectorState{v}, nil
}
func (s CollectorState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeCollectorState(version uint32, payload []byte) (CollectorState, error) {
	if version != CollectorStateVersion {
		return CollectorState{}, fmt.Errorf("unsupported collector version")
	}
	var v collectorValue
	if err := decodeComplete(payload, &v); err != nil {
		return CollectorState{}, err
	}
	for _, ref := range v.History {
		if ref == "" {
			return CollectorState{}, fmt.Errorf("empty period reference")
		}
	}
	return CollectorState{v}, nil
}

// RestoreState loads references only and clears runtime hook wiring. It does not
// call SetHook on referenced periods, replay Start, or alter period metadata.
func (pc *PeriodCollector[M]) RestoreState(s CollectorState, resolve func(string) (M, error)) error {
	if pc == nil {
		return fmt.Errorf("nil collector destination")
	}
	var history []M
	if s.value.History != nil {
		history = make([]M, len(s.value.History))
	}
	for index, ref := range s.value.History {
		if resolve == nil || ref == "" {
			return fmt.Errorf("missing period reference resolver")
		}
		p, err := resolve(ref)
		if err != nil {
			return err
		}
		if nilPeriod(p) {
			return fmt.Errorf("nil resolved period")
		}
		history[index] = p
	}
	*pc = PeriodCollector[M]{History: history}
	return nil
}

// WireHook is an explicit post-restore composition step. WithHook alone only
// affects subsequently started periods; restored history also needs the hook.
func (pc *PeriodCollector[M]) WireHook(hook Hook) {
	pc.WithHook(hook)
	for _, p := range pc.History {
		p.SetHook(hook)
	}
}

// Reflection only detects typed nil at a generic dependency boundary, never
// serializes state or discovers a concrete period implementation.
func nilPeriod(p IsPeriod) bool {
	v := reflect.ValueOf(p)
	if !v.IsValid() {
		return true
	}
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan:
		return v.IsNil()
	}
	return false
}
