package consumeevidence

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const CollectorStateType = "consumeevidence.Collector"
const CollectorStateVersion uint32 = 1

// CollectorState owns only retained per-instance state. The aura tracker,
// parse-wide evidence tracker, and emit callback remain runtime composition.
type CollectorState struct{ value collectorStateValue }

type collectorStateValue struct {
	Snapshot           []auraSnapshotUnitValue `json:"snapshot"`
	PendingProjection  bool                    `json:"pending_projection"`
	EmittedEvidenceIDs []string                `json:"emitted_evidence_ids"`
	CastEpisodes       []castEpisodeValue      `json:"cast_episodes"`
}

type auraSnapshotUnitValue struct {
	Unit  guid.GUID           `json:"unit"`
	Auras []auraSnapshotValue `json:"auras"`
}

type auraSnapshotValue struct {
	Buff           bool                `json:"buff"`
	Source         *guid.GUID          `json:"source"`
	Stacks         int32               `json:"stacks"`
	AppliedAt      time.Time           `json:"applied_at"`
	LastUpdatedAt  time.Time           `json:"last_updated_at"`
	MaxExistsUntil time.Time           `json:"max_exists_until"`
	SpellID        chrondbc.SpellID    `json:"spell_id"`
	SpellName      string              `json:"spell_name"`
	Spell          spellReferenceValue `json:"spell"`
}

func (c *Collector) CaptureState(captureSpell func(*chrondbc.Spell) (string, error)) (CollectorState, error) {
	if c == nil || c.shared == nil {
		return CollectorState{}, fmt.Errorf("incomplete consume evidence collector")
	}
	value := collectorStateValue{PendingProjection: c.pendingProjection}
	if c.snapshot != nil {
		value.Snapshot = make([]auraSnapshotUnitValue, 0, len(c.snapshot))
		for _, unit := range slices.Sorted(maps.Keys(c.snapshot)) {
			spells := c.snapshot[unit]
			unitValue := auraSnapshotUnitValue{Unit: unit}
			if spells != nil {
				unitValue.Auras = make([]auraSnapshotValue, 0, len(spells))
				spellIDs := slices.Sorted(maps.Keys(spells))
				for _, spellID := range spellIDs {
					state := spells[spellID]
					if state == nil {
						return CollectorState{}, fmt.Errorf("nil collector aura snapshot for %s spell %d", unit, spellID)
					}
					spell, err := captureSpellReference(state.Spell, captureSpell)
					if err != nil {
						return CollectorState{}, fmt.Errorf("capture collector aura snapshot: %w", err)
					}
					unitValue.Auras = append(unitValue.Auras, auraSnapshotValue{state.Buff, clonePointer(state.Source), state.Stacks, state.AppliedAt, state.LastUpdatedAt, state.MaxExistsUntil, state.SpellID, state.SpellName, spell})
				}
			}
			value.Snapshot = append(value.Snapshot, unitValue)
		}
	}
	if c.emittedEvidenceIDs != nil {
		value.EmittedEvidenceIDs = slices.Sorted(maps.Keys(c.emittedEvidenceIDs))
	}
	if c.castEpisodes != nil {
		value.CastEpisodes = make([]castEpisodeValue, len(c.castEpisodes))
	}
	for i, episode := range c.castEpisodes {
		spell, err := captureSpellReference(episode.spellData, captureSpell)
		if err != nil {
			return CollectorState{}, fmt.Errorf("capture collector cast episode %d: %w", i, err)
		}
		value.CastEpisodes[i] = castEpisodeValue{episode.consumeID, episode.player, spell, slices.Clone(episode.candidateItems), episode.ts}
	}
	state := CollectorState{value: value}
	if err := state.validate(); err != nil {
		return CollectorState{}, err
	}
	return state, nil
}

func (s CollectorState) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(s.value)
}

func DecodeCollectorState(version uint32, payload []byte) (CollectorState, error) {
	if version != CollectorStateVersion {
		return CollectorState{}, fmt.Errorf("unsupported %s version %d", CollectorStateType, version)
	}
	required := []string{"snapshot", "pending_projection", "emitted_evidence_ids", "cast_episodes"}
	if err := validateStateJSON(payload, "consume evidence collector state", required); err != nil {
		return CollectorState{}, err
	}
	var value collectorStateValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return CollectorState{}, fmt.Errorf("decode consume evidence collector state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return CollectorState{}, fmt.Errorf("trailing consume evidence collector state")
	}
	state := CollectorState{value: value}
	if err := state.validate(); err != nil {
		return CollectorState{}, err
	}
	return state, nil
}

func (s CollectorState) validate() error {
	seenUnits := make(map[guid.GUID]struct{}, len(s.value.Snapshot))
	for _, unit := range s.value.Snapshot {
		if _, exists := seenUnits[unit.Unit]; exists {
			return fmt.Errorf("duplicate collector snapshot unit %s", unit.Unit)
		}
		seenUnits[unit.Unit] = struct{}{}
		seenSpells := make(map[chrondbc.SpellID]struct{}, len(unit.Auras))
		for _, aura := range unit.Auras {
			if _, exists := seenSpells[aura.SpellID]; exists {
				return fmt.Errorf("duplicate collector snapshot spell %d for %s", aura.SpellID, unit.Unit)
			}
			seenSpells[aura.SpellID] = struct{}{}
			if aura.Spell.Path != "" && aura.Spell.ID != aura.SpellID {
				return fmt.Errorf("collector snapshot spell reference ID mismatch for %s", unit.Unit)
			}
			if err := validateSpellReference(aura.Spell); err != nil {
				return err
			}
		}
	}
	seenEvidence := make(map[string]struct{}, len(s.value.EmittedEvidenceIDs))
	for _, evidenceID := range s.value.EmittedEvidenceIDs {
		if evidenceID == "" {
			return fmt.Errorf("empty emitted evidence ID")
		}
		if _, exists := seenEvidence[evidenceID]; exists {
			return fmt.Errorf("duplicate emitted evidence ID %q", evidenceID)
		}
		seenEvidence[evidenceID] = struct{}{}
	}
	for i, episode := range s.value.CastEpisodes {
		if episode.ConsumeID == "" {
			return fmt.Errorf("collector cast episode %d has empty consume ID", i)
		}
		if err := validateSpellReference(episode.Spell); err != nil {
			return fmt.Errorf("collector cast episode %d: %w", i, err)
		}
	}
	return nil
}

func (s CollectorState) Restore(auraTracker *auras.Tracking, shared *Tracker, resolveSpell func(string) (*chrondbc.Spell, error)) (*Collector, error) {
	if shared == nil {
		return nil, fmt.Errorf("nil shared consume evidence tracker")
	}
	if err := s.validate(); err != nil {
		return nil, err
	}
	collector := NewCollector(auraTracker, shared)
	collector.pendingProjection = s.value.PendingProjection
	if s.value.Snapshot != nil {
		collector.snapshot = make(map[guid.GUID]map[chrondbc.SpellID]*auras.AuraState, len(s.value.Snapshot))
	}
	for _, unit := range s.value.Snapshot {
		var spells map[chrondbc.SpellID]*auras.AuraState
		if unit.Auras != nil {
			spells = make(map[chrondbc.SpellID]*auras.AuraState, len(unit.Auras))
		}
		for _, aura := range unit.Auras {
			spell, err := resolveSpellReference(aura.Spell, resolveSpell)
			if err != nil {
				return nil, err
			}
			spells[aura.SpellID] = &auras.AuraState{Buff: aura.Buff, Source: clonePointer(aura.Source), Stacks: aura.Stacks, AppliedAt: aura.AppliedAt, LastUpdatedAt: aura.LastUpdatedAt, MaxExistsUntil: aura.MaxExistsUntil, SpellID: aura.SpellID, SpellName: aura.SpellName, Spell: spell}
		}
		collector.snapshot[unit.Unit] = spells
	}
	if s.value.EmittedEvidenceIDs != nil {
		collector.emittedEvidenceIDs = make(map[string]struct{}, len(s.value.EmittedEvidenceIDs))
		for _, evidenceID := range s.value.EmittedEvidenceIDs {
			collector.emittedEvidenceIDs[evidenceID] = struct{}{}
		}
	}
	if s.value.CastEpisodes != nil {
		collector.castEpisodes = make([]castEpisode, len(s.value.CastEpisodes))
	}
	for i, episode := range s.value.CastEpisodes {
		spell, err := resolveSpellReference(episode.Spell, resolveSpell)
		if err != nil {
			return nil, err
		}
		collector.castEpisodes[i] = castEpisode{episode.ConsumeID, episode.Player, spell, slices.Clone(episode.CandidateItems), episode.Timestamp}
	}
	return collector, nil
}
