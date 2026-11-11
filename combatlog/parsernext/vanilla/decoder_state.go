package vanilla

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/gameversions"
	"github.com/Masterminds/semver"
)

// DecoderStateType and DecoderStateVersion identify one owned value payload in
// the future typed snapshot graph. This codec is not an archive or a full parse
// snapshot: synthetic processors, consumers, input identity and runtime dependency
// fingerprints must be captured/validated by their respective owners.
const DecoderStateType = "parsernext/vanilla.Decoder"
const DecoderStateVersion uint32 = 1

// DecoderState is a detached, immutable-by-API capture of decoder-owned state.
// Capture/restore must not run concurrently with decoding. The session owner is
// responsible for allowing capture only at a successful complete-file boundary.
// The zero value represents a fresh decoder.
type DecoderState struct{ value decoderStateValue }

type decoderStateValue struct {
	LastTimestamp    time.Time                          `json:"last_timestamp"`
	CompanionVersion *string                            `json:"companion_version"`
	Capabilities     Capabilities                       `json:"capabilities"`
	Combatants       map[string]combatantValue          `json:"combatants"`
	Transmogs        map[string]map[int32]transmogValue `json:"transmogs"`
}

// Only Vanilla-owned combatant fields belong here. In particular, do not infer
// talents by reparsing or recanonicalizing: the cached summary, tab names and
// exact tree slices are semantic state, even when they look redundant.
type combatantValue struct {
	Name      string
	Guid      guid.GUID
	Seen      time.Time
	HeroClass types.HeroClasses
	Gender    types.HeroGender
	Race      types.HeroRaces
	PetName   string
	Guild     *combatant.Guild
	Gear      []combatant.GearItem
	Talents   *combatant.Talents
}

type transmogValue struct {
	ObservedItemID    int
	HasObservedItemID bool
	ItemID            int
	TransmogID        int
}

func clonePointer[T any](v *T) *T {
	if v == nil {
		return nil
	}
	copy := *v
	return &copy
}

func cloneCombatantValue(v combatantValue) combatantValue {
	v.Guild = clonePointer(v.Guild)
	v.Gear = combatant.CloneGear(v.Gear)
	v.Talents = combatant.CloneTalents(v.Talents)
	return v
}

// CaptureState copies all owned maps, slices and pointers. Emitted messages and
// later decoder transitions cannot mutate the returned value.
func (d *Decoder) CaptureState() DecoderState {
	v := decoderStateValue{LastTimestamp: d.state.lastTimestamp, Capabilities: d.capabilities}
	if d.state.version != nil {
		version := d.state.version.ChronicleCompanionAddon.Original()
		v.CompanionVersion = &version
	}
	if d.combatants.latestCombatantByName != nil {
		v.Combatants = make(map[string]combatantValue, len(d.combatants.latestCombatantByName))
		for name, c := range d.combatants.latestCombatantByName {
			v.Combatants[name] = cloneCombatantValue(combatantValue{
				Name: c.Name, Guid: c.Guid, Seen: c.Seen, HeroClass: c.HeroClass,
				Gender: c.Gender, Race: c.Race, PetName: c.PetName,
				Guild: c.Guild, Gear: c.GearSetups, Talents: c.Talents,
			})
		}
	}
	if d.combatants.transmogsByName != nil {
		v.Transmogs = make(map[string]map[int32]transmogValue, len(d.combatants.transmogsByName))
		for name, mappings := range d.combatants.transmogsByName {
			v.Transmogs[name] = make(map[int32]transmogValue, len(mappings))
			for slot, m := range mappings {
				v.Transmogs[name][slot] = transmogValue{m.observedItemID, m.hasObservedItemID, m.itemID, m.transmogID}
			}
		}
	}
	return DecoderState{value: v}
}

// Encode returns only the typed value's JSON payload. Type/version belong to the
// enclosing archive Value record, not a competing parser-specific envelope.
func (s DecoderState) Encode() ([]byte, error) { return json.Marshal(s.value) }

// DecodeDecoderState fails closed on unknown versions/fields and trailing data.
// No live decoder is involved, and malformed state is never returned partially.
func DecodeDecoderState(version uint32, payload []byte) (DecoderState, error) {
	if version != DecoderStateVersion {
		return DecoderState{}, fmt.Errorf("unsupported %s version %d", DecoderStateType, version)
	}
	if bytes.Equal(bytes.TrimSpace(payload), []byte("null")) {
		return DecoderState{}, fmt.Errorf("null decoder state")
	}
	var v decoderStateValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&v); err != nil {
		return DecoderState{}, fmt.Errorf("decode vanilla state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return DecoderState{}, fmt.Errorf("trailing decoder state data")
	}
	// All root fields are required, including explicit null caches/version. A
	// truncated but syntactically valid object must not silently become fresh state.
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return DecoderState{}, err
	}
	for _, name := range []string{"last_timestamp", "companion_version", "capabilities", "combatants", "transmogs"} {
		if _, ok := fields[name]; !ok {
			return DecoderState{}, fmt.Errorf("missing decoder state field %q", name)
		}
	}
	for _, name := range []string{"last_timestamp", "capabilities"} {
		if bytes.Equal(bytes.TrimSpace(fields[name]), []byte("null")) {
			return DecoderState{}, fmt.Errorf("null decoder state field %q", name)
		}
	}
	if err := v.validate(); err != nil {
		return DecoderState{}, err
	}
	return DecoderState{value: v}, nil
}

func (v decoderStateValue) validate() error {
	if v.CompanionVersion != nil {
		if _, err := semver.NewVersion(*v.CompanionVersion); err != nil {
			return fmt.Errorf("invalid companion version: %w", err)
		}
	}
	for name, c := range v.Combatants {
		if name != c.Name {
			return fmt.Errorf("combatant cache key %q does not match name %q", name, c.Name)
		}
	}
	for name, mappings := range v.Transmogs {
		for slot, m := range mappings {
			// Negative/out-of-range slots and IDs are accepted by legacy parsing; keep
			// them, but reject an observation impossible for recordTransmogs to produce.
			if !m.HasObservedItemID && m.ObservedItemID != 0 {
				return fmt.Errorf("unmarked transmog observation for %q slot %d", name, slot)
			}
		}
	}
	return nil
}

// Restore constructs a NEW decoder using caller-injected runtime dependencies.
// It does not rerun gear resolution or talent canonicalization. The caller must
// check dependency identities in the enclosing archive fingerprint first.
func (s DecoderState) Restore(spells SpellLookup, chronicleVersion string, options ...DecoderOptions) (*Decoder, error) {
	if err := s.value.validate(); err != nil {
		return nil, err
	}
	d := NewDecoder(spells, chronicleVersion, options...)
	d.state.lastTimestamp = s.value.LastTimestamp
	if s.value.CompanionVersion != nil {
		version, err := semver.NewVersion(*s.value.CompanionVersion)
		if err != nil {
			return nil, err
		}
		d.state.version = &gameversions.GameVersion{ChronicleCompanionAddon: version}
	}
	d.capabilities = s.value.Capabilities
	if s.value.Combatants != nil {
		d.combatants.latestCombatantByName = make(map[string]combatant.Combatant, len(s.value.Combatants))
		for name, c := range s.value.Combatants {
			c = cloneCombatantValue(c)
			d.combatants.latestCombatantByName[name] = combatant.Combatant{Name: c.Name, Guid: c.Guid, Seen: c.Seen, HeroClass: c.HeroClass, Gender: c.Gender, Race: c.Race, PetName: c.PetName, Guild: c.Guild, GearSetups: c.Gear, Talents: c.Talents}
		}
	}
	if s.value.Transmogs != nil {
		d.combatants.transmogsByName = make(map[string]map[int32]transmogGearMapping, len(s.value.Transmogs))
		for name, mappings := range s.value.Transmogs {
			restored := make(map[int32]transmogGearMapping, len(mappings))
			for slot, m := range mappings {
				restored[slot] = transmogGearMapping{m.ObservedItemID, m.HasObservedItemID, m.ItemID, m.TransmogID}
			}
			d.combatants.transmogsByName[name] = restored
		}
	}
	return d, nil
}
