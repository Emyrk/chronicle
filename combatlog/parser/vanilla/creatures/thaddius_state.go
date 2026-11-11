package creatures

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const ThaddiusPartyStateType = "vanilla.ThaddiusParty"
const ThaddiusPartyStateVersion uint32 = 1

type ThaddiusPartyState struct{ value ThaddiusPartyValue }
type ThaddiusPartyValue struct {
	Common         string    `json:"common"`
	PendingDeath   string    `json:"pending_death"`
	Entry          uint32    `json:"entry"`
	BuggedPrevious guid.GUID `json:"bugged_previous"`
}

func (c *ThaddiusParty) CaptureState(common func(*characters.Common) (string, error), message func(messages.Message) (string, error)) (ThaddiusPartyState, error) {
	if c == nil || c.all == nil {
		return ThaddiusPartyState{}, fmt.Errorf("missing ThaddiusParty dependencies")
	}
	base, e := captureCommonOwner("ThaddiusParty", c.Common, common)
	if e != nil {
		return ThaddiusPartyState{}, e
	}
	v := ThaddiusPartyValue{Common: base.reference, Entry: c.entry, BuggedPrevious: c.buggedPrevious}
	if c.pendingDeath != nil {
		if nilPendingMessage(*c.pendingDeath) || message == nil {
			return ThaddiusPartyState{}, fmt.Errorf("missing pending death/capture")
		}
		v.PendingDeath, e = message(*c.pendingDeath)
		if e != nil {
			return ThaddiusPartyState{}, e
		}
		if v.PendingDeath == "" {
			return ThaddiusPartyState{}, fmt.Errorf("empty pending death reference")
		}
	}
	return ThaddiusPartyState{v}, nil
}
func (s ThaddiusPartyState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeThaddiusPartyState(version uint32, payload []byte) (ThaddiusPartyState, error) {
	if version != ThaddiusPartyStateVersion {
		return ThaddiusPartyState{}, fmt.Errorf("unsupported ThaddiusParty version")
	}
	var v ThaddiusPartyValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return ThaddiusPartyState{}, e
	}
	if v.Common == "" {
		return ThaddiusPartyState{}, fmt.Errorf("empty Common reference")
	}
	return ThaddiusPartyState{v}, nil
}
func (c *ThaddiusParty) RestoreState(s ThaddiusPartyState, all *characters.Characters, common func(string) (*characters.Common, error), message func(string) (messages.Message, error)) error {
	if c == nil || all == nil {
		return fmt.Errorf("missing ThaddiusParty destination/dependencies")
	}
	base, e := (CommonOwnerState{owner: "ThaddiusParty", reference: s.value.Common}).resolve("ThaddiusParty", common)
	if e != nil {
		return e
	}
	var pending *messages.Message
	if s.value.PendingDeath != "" {
		if message == nil {
			return fmt.Errorf("missing pending message resolver")
		}
		m, e := message(s.value.PendingDeath)
		if e != nil {
			return e
		}
		if nilPendingMessage(m) {
			return fmt.Errorf("nil pending death")
		}
		pending = &m
	}
	// Capture is supported only at quiescent completed-message boundaries, never
	// mid-callback, reentrantly, or after a fatal/panic-interrupted session.
	// At these boundaries, a nonzero GUID means the one-shot work
	// has not run; the callback always clears it. A fresh Once preserves that
	// semantic state without executing or serializing synchronization machinery.
	*c = ThaddiusParty{Common: base, all: all, pendingDeath: pending, entry: s.value.Entry, buggedPrevious: s.value.BuggedPrevious}
	return nil
}
