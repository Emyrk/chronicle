package consumeevidence

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const TrackerStateType = "consumeevidence.Tracker"
const TrackerStateVersion uint32 = 1

// TrackerState owns retained parse-wide evidence. The catalog and immutable
// spell objects are injected under the compatible session fingerprint.
type TrackerState struct{ value trackerStateValue }

type trackerStateValue struct {
	DirectEpisodes        []directEpisodeValue `json:"direct_episodes"`
	AuraEpisodes          []auraEpisodeValue   `json:"aura_episodes"`
	PreCombatEvidence     []consumeValue       `json:"pre_combat_evidence"`
	PreCombatCastEpisodes []castEpisodeValue   `json:"pre_combat_cast_episodes"`
}

type spellReferenceValue struct {
	ID   chrondbc.SpellID `json:"id"`
	Path string           `json:"path"`
}

type directEpisodeValue struct {
	ConsumeID string              `json:"consume_id"`
	Player    guid.GUID           `json:"player"`
	ItemID    int32               `json:"item_id"`
	Spell     spellReferenceValue `json:"spell"`
	Timestamp time.Time           `json:"timestamp"`
}

type auraEpisodeValue struct {
	ConsumeID string              `json:"consume_id"`
	Player    guid.GUID           `json:"player"`
	Spell     spellReferenceValue `json:"spell"`
	AppliedAt time.Time           `json:"applied_at"`
	ItemIDs   []int32             `json:"item_ids"`
}

type castEpisodeValue struct {
	ConsumeID      string              `json:"consume_id"`
	Player         guid.GUID           `json:"player"`
	Spell          spellReferenceValue `json:"spell"`
	CandidateItems []int32             `json:"candidate_items"`
	Timestamp      time.Time           `json:"timestamp"`
}

type consumeValue struct {
	Base             messages.MessageBaseState   `json:"base"`
	ConsumeID        string                      `json:"consume_id"`
	EvidenceID       string                      `json:"evidence_id"`
	Player           guid.GUID                   `json:"player"`
	ItemID           *int32                      `json:"item_id"`
	ItemName         *string                     `json:"item_name"`
	CandidateItemIDs []int32                     `json:"candidate_item_ids"`
	Spell            spellReferenceValue         `json:"spell"`
	Kind             messages.EvidenceKind       `json:"kind"`
	Confidence       messages.EvidenceConfidence `json:"confidence"`
	ConsumedAtUnixMS *int64                      `json:"consumed_at_unix_ms"`
	ObservedAtUnixMS int64                       `json:"observed_at_unix_ms"`
	Amount           *int32                      `json:"amount"`
	ResourceType     *string                     `json:"resource_type"`
	IsProjection     bool                        `json:"is_projection"`
}

func captureSpellReference(spell *chrondbc.Spell, capture func(*chrondbc.Spell) (string, error)) (spellReferenceValue, error) {
	if spell == nil {
		return spellReferenceValue{}, nil
	}
	if capture == nil {
		return spellReferenceValue{}, fmt.Errorf("missing consume evidence spell capture")
	}
	path, err := capture(spell)
	if err != nil {
		return spellReferenceValue{}, err
	}
	if path == "" {
		return spellReferenceValue{}, fmt.Errorf("empty consume evidence spell reference")
	}
	return spellReferenceValue{ID: spell.ID, Path: path}, nil
}

func resolveSpellReference(ref spellReferenceValue, resolve func(string) (*chrondbc.Spell, error)) (*chrondbc.Spell, error) {
	if ref.Path == "" {
		return nil, nil
	}
	if resolve == nil {
		return nil, fmt.Errorf("missing consume evidence spell resolver")
	}
	spell, err := resolve(ref.Path)
	if err != nil {
		return nil, err
	}
	if spell == nil {
		return nil, fmt.Errorf("nil consume evidence spell reference %q", ref.Path)
	}
	if spell.ID != ref.ID {
		return nil, fmt.Errorf("consume evidence spell %q resolved ID %d, want %d", ref.Path, spell.ID, ref.ID)
	}
	return spell, nil
}

func (t *Tracker) CaptureState(captureSpell func(*chrondbc.Spell) (string, error)) (TrackerState, error) {
	if t == nil {
		return TrackerState{}, fmt.Errorf("nil consume evidence tracker")
	}
	value := trackerStateValue{}
	if t.directEpisodes != nil {
		value.DirectEpisodes = make([]directEpisodeValue, len(t.directEpisodes))
	}
	for i, episode := range t.directEpisodes {
		spell, err := captureSpellReference(episode.spellData, captureSpell)
		if err != nil {
			return TrackerState{}, fmt.Errorf("capture direct episode %d: %w", i, err)
		}
		value.DirectEpisodes[i] = directEpisodeValue{episode.consumeID, episode.player, episode.itemID, spell, episode.ts}
	}
	if t.auraEpisodes != nil {
		value.AuraEpisodes = make([]auraEpisodeValue, len(t.auraEpisodes))
	}
	for i, episode := range t.auraEpisodes {
		spell, err := captureSpellReference(episode.spellData, captureSpell)
		if err != nil {
			return TrackerState{}, fmt.Errorf("capture aura episode %d: %w", i, err)
		}
		value.AuraEpisodes[i] = auraEpisodeValue{episode.consumeID, episode.player, spell, episode.appliedAt, slices.Clone(episode.itemIDs)}
	}
	if t.preCombatEvidence != nil {
		value.PreCombatEvidence = make([]consumeValue, len(t.preCombatEvidence))
	}
	for i, evidence := range t.preCombatEvidence {
		if evidence == nil {
			return TrackerState{}, fmt.Errorf("nil precombat evidence %d", i)
		}
		captured, err := captureConsume(evidence, captureSpell)
		if err != nil {
			return TrackerState{}, fmt.Errorf("capture precombat evidence %d: %w", i, err)
		}
		value.PreCombatEvidence[i] = captured
	}
	if t.preCombatCastEpisodes != nil {
		value.PreCombatCastEpisodes = make([]castEpisodeValue, len(t.preCombatCastEpisodes))
	}
	for i, episode := range t.preCombatCastEpisodes {
		spell, err := captureSpellReference(episode.spellData, captureSpell)
		if err != nil {
			return TrackerState{}, fmt.Errorf("capture precombat cast episode %d: %w", i, err)
		}
		value.PreCombatCastEpisodes[i] = castEpisodeValue{episode.consumeID, episode.player, spell, slices.Clone(episode.candidateItems), episode.ts}
	}
	state := TrackerState{value: value}
	if err := state.validate(); err != nil {
		return TrackerState{}, err
	}
	return state, nil
}

func captureConsume(consume *messages.Consume, captureSpell func(*chrondbc.Spell) (string, error)) (consumeValue, error) {
	spell, err := captureSpellReference(consume.SpellData, captureSpell)
	if err != nil {
		return consumeValue{}, err
	}
	return consumeValue{
		Base: consume.CaptureState(), ConsumeID: consume.ConsumeID, EvidenceID: consume.EvidenceID,
		Player: consume.Player, ItemID: clonePointer(consume.ItemID), ItemName: clonePointer(consume.ItemName),
		CandidateItemIDs: slices.Clone(consume.CandidateItemIDs), Spell: spell, Kind: consume.Kind,
		Confidence: consume.Confidence, ConsumedAtUnixMS: clonePointer(consume.ConsumedAtUnixMs),
		ObservedAtUnixMS: consume.ObservedAtUnixMs, Amount: clonePointer(consume.Amount),
		ResourceType: clonePointer(consume.ResourceType), IsProjection: consume.IsProjection,
	}, nil
}

func (s TrackerState) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(s.value)
}

func DecodeTrackerState(version uint32, payload []byte) (TrackerState, error) {
	if version != TrackerStateVersion {
		return TrackerState{}, fmt.Errorf("unsupported %s version %d", TrackerStateType, version)
	}
	required := []string{"direct_episodes", "aura_episodes", "pre_combat_evidence", "pre_combat_cast_episodes"}
	if err := validateStateJSON(payload, "consume evidence tracker state", required); err != nil {
		return TrackerState{}, err
	}
	var value trackerStateValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return TrackerState{}, fmt.Errorf("decode consume evidence tracker state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return TrackerState{}, fmt.Errorf("trailing consume evidence tracker state")
	}
	state := TrackerState{value: value}
	if err := state.validate(); err != nil {
		return TrackerState{}, err
	}
	return state, nil
}

func (s TrackerState) validate() error {
	for i, episode := range s.value.DirectEpisodes {
		if episode.ConsumeID == "" {
			return fmt.Errorf("direct episode %d has empty consume ID", i)
		}
		if err := validateSpellReference(episode.Spell); err != nil {
			return fmt.Errorf("direct episode %d: %w", i, err)
		}
	}
	for i, episode := range s.value.AuraEpisodes {
		if episode.ConsumeID == "" {
			return fmt.Errorf("aura episode %d has empty consume ID", i)
		}
		if err := validateSpellReference(episode.Spell); err != nil {
			return fmt.Errorf("aura episode %d: %w", i, err)
		}
	}
	for i, evidence := range s.value.PreCombatEvidence {
		if evidence.ConsumeID == "" || evidence.EvidenceID == "" {
			return fmt.Errorf("precombat evidence %d has empty stable ID", i)
		}
		if err := validateSpellReference(evidence.Spell); err != nil {
			return fmt.Errorf("precombat evidence %d: %w", i, err)
		}
	}
	for i, episode := range s.value.PreCombatCastEpisodes {
		if episode.ConsumeID == "" {
			return fmt.Errorf("precombat cast episode %d has empty consume ID", i)
		}
		if err := validateSpellReference(episode.Spell); err != nil {
			return fmt.Errorf("precombat cast episode %d: %w", i, err)
		}
	}
	return nil
}

func validateSpellReference(ref spellReferenceValue) error {
	if ref.Path == "" && ref.ID != 0 {
		return fmt.Errorf("spell ID %d has no canonical reference", ref.ID)
	}
	return nil
}

func (s TrackerState) Restore(catalog ConsumableCatalog, resolveSpell func(string) (*chrondbc.Spell, error)) (*Tracker, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	tracker := NewTracker(catalog)
	if s.value.DirectEpisodes != nil {
		tracker.directEpisodes = make([]directEpisode, len(s.value.DirectEpisodes))
	}
	for i, episode := range s.value.DirectEpisodes {
		spell, err := resolveSpellReference(episode.Spell, resolveSpell)
		if err != nil {
			return nil, err
		}
		tracker.directEpisodes[i] = directEpisode{episode.ConsumeID, episode.Player, episode.ItemID, spell, episode.Timestamp}
	}
	if s.value.AuraEpisodes != nil {
		tracker.auraEpisodes = make([]auraEpisode, len(s.value.AuraEpisodes))
	}
	for i, episode := range s.value.AuraEpisodes {
		spell, err := resolveSpellReference(episode.Spell, resolveSpell)
		if err != nil {
			return nil, err
		}
		tracker.auraEpisodes[i] = auraEpisode{episode.ConsumeID, episode.Player, spell, episode.AppliedAt, slices.Clone(episode.ItemIDs)}
	}
	if s.value.PreCombatEvidence != nil {
		tracker.preCombatEvidence = make([]*messages.Consume, len(s.value.PreCombatEvidence))
	}
	for i, evidence := range s.value.PreCombatEvidence {
		restored, err := evidence.restore(resolveSpell)
		if err != nil {
			return nil, err
		}
		tracker.preCombatEvidence[i] = restored
	}
	if s.value.PreCombatCastEpisodes != nil {
		tracker.preCombatCastEpisodes = make([]castEpisode, len(s.value.PreCombatCastEpisodes))
	}
	for i, episode := range s.value.PreCombatCastEpisodes {
		spell, err := resolveSpellReference(episode.Spell, resolveSpell)
		if err != nil {
			return nil, err
		}
		tracker.preCombatCastEpisodes[i] = castEpisode{episode.ConsumeID, episode.Player, spell, slices.Clone(episode.CandidateItems), episode.Timestamp}
	}
	return tracker, nil
}

func (v consumeValue) restore(resolveSpell func(string) (*chrondbc.Spell, error)) (*messages.Consume, error) {
	spell, err := resolveSpellReference(v.Spell, resolveSpell)
	if err != nil {
		return nil, err
	}
	return &messages.Consume{
		MessageBase: v.Base.Restore(), ConsumeID: v.ConsumeID, EvidenceID: v.EvidenceID,
		Player: v.Player, ItemID: clonePointer(v.ItemID), ItemName: clonePointer(v.ItemName),
		CandidateItemIDs: slices.Clone(v.CandidateItemIDs), SpellData: spell, Kind: v.Kind,
		Confidence: v.Confidence, ConsumedAtUnixMs: clonePointer(v.ConsumedAtUnixMS),
		ObservedAtUnixMs: v.ObservedAtUnixMS, Amount: clonePointer(v.Amount),
		ResourceType: clonePointer(v.ResourceType), IsProjection: v.IsProjection,
	}, nil
}

func clonePointer[T any](value *T) *T {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func validateStateJSON(payload []byte, label string, required []string) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	var visit func(string) error
	visit = func(path string) error {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		delim, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			seen := make(map[string]struct{})
			for decoder.More() {
				nameToken, err := decoder.Token()
				if err != nil {
					return err
				}
				name, ok := nameToken.(string)
				if !ok {
					return fmt.Errorf("%s field name is not a string", label)
				}
				if _, exists := seen[name]; exists {
					return fmt.Errorf("duplicate %s field %s.%s", label, path, name)
				}
				seen[name] = struct{}{}
				if err := visit(path + "." + name); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		case '[':
			for i := 0; decoder.More(); i++ {
				if err := visit(fmt.Sprintf("%s[%d]", path, i)); err != nil {
					return err
				}
			}
			_, err = decoder.Token()
			return err
		default:
			return fmt.Errorf("unexpected %s delimiter", label)
		}
	}
	if err := visit("state"); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing %s", label)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || fields == nil {
		return fmt.Errorf("%s must be an object", label)
	}
	if len(fields) != len(required) {
		return fmt.Errorf("%s requires %d fields", label, len(required))
	}
	for _, name := range required {
		if len(fields[name]) == 0 {
			return fmt.Errorf("missing %s field %q", label, name)
		}
	}
	return nil
}
