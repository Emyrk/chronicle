package synthetic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// These identify a single owned value in the future typed snapshot graph, not
// an archive envelope. This codec does not make the synthetic pipeline resumable.
const AuraOwnershipStateType = "parsernext/vanilla/synthetic.AuraOwnership"
const AuraOwnershipStateVersion uint32 = 1

// AuraOwnershipState is detached and immutable through its public API. Capture
// must be serialized with processing. The session owner, not this value codec,
// enforces successful complete-file boundaries and dependency fingerprints.
type AuraOwnershipState struct{ pending []auraCastValue }

type auraCastValue struct {
	Target  guid.GUID        `json:"target"`
	SpellID chrondbc.SpellID `json:"spell_id"`
	Caster  guid.GUID        `json:"caster"`
	At      time.Time        `json:"at"`
}

// CaptureState preserves every pending candidate, without running expiry.
func (a *AuraOwnership) CaptureState() AuraOwnershipState {
	entries := make([]auraCastValue, 0, len(a.pending))
	for key, value := range a.pending {
		entries = append(entries, auraCastValue{Target: key.target, SpellID: key.spellID, Caster: value.caster, At: value.at})
	}
	// Map iteration order is not semantic. Sorting also makes payload comparisons
	// useful without introducing ordering into the runtime algorithm.
	slices.SortFunc(entries, func(a, b auraCastValue) int {
		if a.Target < b.Target {
			return -1
		}
		if a.Target > b.Target {
			return 1
		}
		if a.SpellID < b.SpellID {
			return -1
		}
		if a.SpellID > b.SpellID {
			return 1
		}
		return 0
	})
	return AuraOwnershipState{pending: entries}
}

// Encode emits only the owned value payload; the archive supplies type/version.
func (s AuraOwnershipState) Encode() ([]byte, error) {
	return json.Marshal(struct {
		Pending []auraCastValue `json:"pending"`
	}{s.pending})
}

// DecodeAuraOwnershipState validates all data before returning a usable value.
// Target/spell ID zero and zero timestamps are accepted by the algorithm and
// therefore valid here; only zero casters are impossible retained candidates.
func DecodeAuraOwnershipState(version uint32, payload []byte) (AuraOwnershipState, error) {
	if version != AuraOwnershipStateVersion {
		return AuraOwnershipState{}, fmt.Errorf("unsupported %s version %d", AuraOwnershipStateType, version)
	}
	var root struct {
		Pending json.RawMessage `json:"pending"`
	}
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&root); err != nil {
		return AuraOwnershipState{}, fmt.Errorf("decode aura ownership: %w", err)
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return AuraOwnershipState{}, fmt.Errorf("trailing aura ownership data")
	}
	if len(root.Pending) == 0 {
		return AuraOwnershipState{}, fmt.Errorf("missing aura ownership pending field")
	}
	var raw []json.RawMessage
	if err := json.Unmarshal(root.Pending, &raw); err != nil {
		return AuraOwnershipState{}, fmt.Errorf("decode pending casts: %w", err)
	}
	entries := make([]auraCastValue, len(raw))
	for i, entry := range raw {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(entry, &fields); err != nil {
			return AuraOwnershipState{}, fmt.Errorf("pending cast %d: %w", i, err)
		}
		for _, name := range []string{"target", "spell_id", "caster", "at"} {
			value, ok := fields[name]
			if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
				return AuraOwnershipState{}, fmt.Errorf("pending cast %d missing or null %s", i, name)
			}
		}
		d := json.NewDecoder(bytes.NewReader(entry))
		d.DisallowUnknownFields()
		if err := d.Decode(&entries[i]); err != nil {
			return AuraOwnershipState{}, fmt.Errorf("pending cast %d: %w", i, err)
		}
	}
	s := AuraOwnershipState{pending: entries}
	if err := s.validate(); err != nil {
		return AuraOwnershipState{}, err
	}
	return s, nil
}

func (s AuraOwnershipState) validate() error {
	seen := make(map[auraOwnershipKey]struct{}, len(s.pending))
	for _, entry := range s.pending {
		if entry.Caster.IsZero() {
			return fmt.Errorf("pending aura cast has zero caster")
		}
		key := auraOwnershipKey{target: entry.Target, spellID: entry.SpellID}
		if _, ok := seen[key]; ok {
			return fmt.Errorf("duplicate pending aura target %s spell %d", entry.Target, entry.SpellID)
		}
		seen[key] = struct{}{}
	}
	return nil
}

// Restore constructs a fresh correlator. No message/spell objects or runtime
// dependencies need resolution: record() retained only copied scalar evidence.
func (s AuraOwnershipState) Restore() (*AuraOwnership, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	a := NewAuraOwnership()
	for _, entry := range s.pending {
		a.pending[auraOwnershipKey{target: entry.Target, spellID: entry.SpellID}] = pendingAuraCast{caster: entry.Caster, at: entry.At}
	}
	return a, nil
}
