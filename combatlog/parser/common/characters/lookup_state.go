package characters

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/characterset"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"slices"
	"sort"
)

// TrustedFactoryRecipe binds ordered factories to the enclosing parser/flavor/
// dataset fingerprint. IDs are supplied by trusted code, never archive lookup.
// Function identity is not inferred from addresses or serialized closures.
type TrustedFactoryRecipe struct {
	ID         string
	FactoryIDs []string
	Factories  []CharacterFactory
}

func (r TrustedFactoryRecipe) validate() error {
	if r.ID == "" || len(r.FactoryIDs) != len(r.Factories) {
		return fmt.Errorf("incomplete character factory recipe")
	}
	for i, id := range r.FactoryIDs {
		if id == "" || r.Factories[i] == nil {
			return fmt.Errorf("invalid character factory recipe entry")
		}
	}
	return nil
}
func (r TrustedFactoryRecipe) New(db *unitdb.Units, id *identifier.Identifier) (*Characters, error) {
	if e := r.validate(); e != nil {
		return nil, e
	}
	if db == nil || id == nil {
		return nil, fmt.Errorf("missing character dependencies")
	}
	c := NewCharacters(db, slices.Clone(r.Factories), id)
	c.snapshotRecipe = r.ID
	c.snapshotFactoryIDs = slices.Clone(r.FactoryIDs)
	return c, nil
}

const CharactersStateType = "characters.Characters"
const CharactersStateVersion uint32 = 1

type CharactersState struct{ value charactersValue }
type charactersRuntimeShape struct {
	Hooks        int  `json:"hooks"`
	Participants bool `json:"participants"`
	Phase        bool `json:"phase"`
}
type charactersValue struct {
	Recipe          string                 `json:"recipe"`
	Factories       []string               `json:"factories"`
	All             json.RawMessage        `json:"all"`
	ByEntry         map[uint32][]string    `json:"by_entry"`
	Shared          map[string]string      `json:"shared"`
	ActivityChanged []string               `json:"activity_changed"`
	Staged          []phases.Transition    `json:"staged"`
	Explicit        bool                   `json:"explicit"`
	Runtime         charactersRuntimeShape `json:"runtime"`
}

func (c *Characters) CaptureState(character func(Character) (string, error), shared func(any) (string, error)) (CharactersState, error) {
	if c == nil || c.snapshotRecipe == "" || c.restoreRuntime != nil || c.All == nil || c.db == nil || c.idf == nil || c.ByEntry == nil || c.sharedState == nil {
		return CharactersState{}, fmt.Errorf("characters require initialized, wired trusted recipe")
	}
	if len(c.factories) != len(c.snapshotFactoryIDs) {
		return CharactersState{}, fmt.Errorf("factory recipe changed")
	}
	ref := func(ch Character) (string, error) {
		if nilReference(ch) || character == nil {
			return "", fmt.Errorf("missing character/capture")
		}
		s, e := character(ch)
		if e != nil {
			return "", e
		}
		if s == "" {
			return "", fmt.Errorf("empty character reference")
		}
		return s, nil
	}
	set, e := c.All.CaptureState(ref)
	if e != nil {
		return CharactersState{}, e
	}
	data, e := set.Encode()
	if e != nil {
		return CharactersState{}, e
	}
	v := charactersValue{Recipe: c.snapshotRecipe, Factories: slices.Clone(c.snapshotFactoryIDs), All: data, ByEntry: make(map[uint32][]string, len(c.ByEntry)), Shared: make(map[string]string, len(c.sharedState)), Staged: slices.Clone(c.stagedTransitions), Explicit: c.explicitEncounter, Runtime: charactersRuntimeShape{len(c.hooks), c.noKnownParticipantsAlive != nil, c.phaseTransitionCb != nil}}
	for entry, chars := range c.ByEntry {
		var refs []string
		if chars != nil {
			refs = make([]string, 0, len(chars))
		}
		for _, ch := range chars {
			s, e := ref(ch)
			if e != nil {
				return CharactersState{}, e
			}
			refs = append(refs, s)
		}
		v.ByEntry[entry] = refs
	}
	for key, value := range c.sharedState {
		if nilReference(value) || shared == nil {
			return CharactersState{}, fmt.Errorf("missing shared owner/capture")
		}
		s, e := shared(value)
		if e != nil {
			return CharactersState{}, e
		}
		if s == "" {
			return CharactersState{}, fmt.Errorf("empty shared reference")
		}
		v.Shared[key] = s
	}
	if c.activityChanged != nil {
		v.ActivityChanged = make([]string, 0, len(c.activityChanged))
	}
	for ch := range c.activityChanged {
		s, e := ref(ch)
		if e != nil {
			return CharactersState{}, e
		}
		v.ActivityChanged = append(v.ActivityChanged, s)
	}
	sort.Strings(v.ActivityChanged)
	for _, h := range c.hooks {
		if nilReference(h) {
			return CharactersState{}, fmt.Errorf("nil set hook")
		}
	}
	return CharactersState{v}, nil
}
func (s CharactersState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeCharactersState(version uint32, payload []byte) (CharactersState, error) {
	if version != CharactersStateVersion {
		return CharactersState{}, fmt.Errorf("unsupported Characters version")
	}
	var v charactersValue
	if e := decodeCharacterValue(payload, &v); e != nil {
		return CharactersState{}, e
	}
	if e := v.validate(); e != nil {
		return CharactersState{}, e
	}
	return CharactersState{v}, nil
}
func (v charactersValue) validate() error {
	if v.Recipe == "" || v.ByEntry == nil || v.Shared == nil || v.Runtime.Hooks < 0 {
		return fmt.Errorf("incomplete Characters state")
	}
	if _, e := characterset.DecodeState(characterset.StateVersion, v.All); e != nil {
		return e
	}
	for _, id := range v.Factories {
		if id == "" {
			return fmt.Errorf("empty factory id")
		}
	}
	for _, refs := range v.ByEntry {
		for _, r := range refs {
			if r == "" {
				return fmt.Errorf("empty ByEntry reference")
			}
		}
	}
	for _, r := range v.Shared {
		if r == "" {
			return fmt.Errorf("empty shared reference")
		}
	}
	seen := map[string]bool{}
	for _, r := range v.ActivityChanged {
		if r == "" || seen[r] {
			return fmt.Errorf("invalid activity reference")
		}
		seen[r] = true
	}
	return nil
}

// RestoreState only loads aggregate-owned indexes after all dependencies resolve.
// Canonical owners must be initialized/loaded before this final aggregate phase.
// It does not invoke factories, hooks, Add, Touch, or shared-state constructors.
func (c *Characters) RestoreState(s CharactersState, recipe TrustedFactoryRecipe, db *unitdb.Units, id *identifier.Identifier, character func(string) (Character, error), shared func(string) (any, error)) error {
	if c == nil || db == nil || id == nil {
		return fmt.Errorf("missing Characters destination/dependencies")
	}
	if e := s.value.validate(); e != nil {
		return e
	}
	if e := recipe.validate(); e != nil {
		return e
	}
	v := s.value
	if v.Recipe != recipe.ID || !slices.Equal(v.Factories, recipe.FactoryIDs) {
		return fmt.Errorf("character factory recipe mismatch")
	}
	// Resolve each character path exactly once and validate secondary indexes
	// against All, rather than trusting distinct resolver calls to preserve aliases.
	cache := map[string]Character{}
	ref := func(path string) (Character, error) {
		if ch, ok := cache[path]; ok {
			return ch, nil
		}
		if character == nil {
			return nil, fmt.Errorf("missing character resolver")
		}
		ch, e := character(path)
		if e != nil {
			return nil, e
		}
		if nilReference(ch) {
			return nil, fmt.Errorf("nil character")
		}
		cache[path] = ch
		return ch, nil
	}
	setState, e := characterset.DecodeState(characterset.StateVersion, v.All)
	if e != nil {
		return e
	}
	all, e := characterset.RestoreState(setState, ref)
	if e != nil {
		return e
	}
	byEntry := make(map[uint32][]Character, len(v.ByEntry))
	for entry, paths := range v.ByEntry {
		var chars []Character
		if paths != nil {
			chars = make([]Character, 0, len(paths))
		}
		for _, p := range paths {
			ch, ok := cache[p]
			if !ok {
				return fmt.Errorf("ByEntry reference outside All")
			}
			actual, ok := ch.ID().GetEntry()
			if !ok || !ch.ID().IsCreature() || actual != entry {
				return fmt.Errorf("ByEntry identity mismatch")
			}
			chars = append(chars, ch)
		}
		byEntry[entry] = chars
	}
	sharedState := make(map[string]any, len(v.Shared))
	sharedCache := map[string]any{}
	for key, path := range v.Shared {
		value, ok := sharedCache[path]
		if !ok {
			if shared == nil {
				return fmt.Errorf("missing shared owner resolver")
			}
			var err error
			value, err = shared(path)
			if err != nil {
				return err
			}
			if nilReference(value) {
				return fmt.Errorf("nil shared owner")
			}
			sharedCache[path] = value
		}
		sharedState[key] = value
	}
	var changed map[Character]struct{}
	if v.ActivityChanged != nil {
		changed = make(map[Character]struct{}, len(v.ActivityChanged))
	}
	for _, p := range v.ActivityChanged {
		ch, ok := cache[p]
		if !ok {
			return fmt.Errorf("activity reference outside All")
		}
		changed[ch] = struct{}{}
	}
	shape := v.Runtime
	*c = Characters{All: all, ByEntry: byEntry, db: db, idf: id, factories: slices.Clone(recipe.Factories), snapshotRecipe: recipe.ID, snapshotFactoryIDs: slices.Clone(recipe.FactoryIDs), sharedState: sharedState, activityChanged: changed, stagedTransitions: slices.Clone(v.Staged), explicitEncounter: v.Explicit, restoreRuntime: &shape}
	return nil
}

// CharactersRuntime injects ordered callbacks only after the complete graph has
// validated. Character period wiring is a separate canonical-owner operation.
type CharactersRuntime struct {
	Hooks                    []SetHook
	NoKnownParticipantsAlive func() bool
	PhaseTransition          phases.TransitionCallback
}

func (c *Characters) WireStateRuntime(runtime CharactersRuntime) error {
	if c == nil || c.restoreRuntime == nil {
		return fmt.Errorf("Characters not awaiting runtime wiring")
	}
	shape := charactersRuntimeShape{len(runtime.Hooks), runtime.NoKnownParticipantsAlive != nil, runtime.PhaseTransition != nil}
	if shape != *c.restoreRuntime {
		return fmt.Errorf("Characters runtime recipe mismatch")
	}
	for _, h := range runtime.Hooks {
		if nilReference(h) {
			return fmt.Errorf("nil runtime set hook")
		}
	}
	c.hooks = slices.Clone(runtime.Hooks)
	c.noKnownParticipantsAlive = runtime.NoKnownParticipantsAlive
	c.phaseTransitionCb = runtime.PhaseTransition
	c.restoreRuntime = nil
	return nil
}
