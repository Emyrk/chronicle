// Package consumeevidence implements a parser hook that observes combat-log
// messages and emits Consume events for each piece of evidence that a player
// consumed an item.
//
// Covered evidence kinds:
//   - Direct item-backed SpellGo (A1: EvidenceKindDirectItem, ConfidenceDirect)
//   - Aura-gain matching a known consumable buff (A2: EvidenceKindAura, ConfidenceEffectDerived)
//   - Active-at-pull projection of consumable auras (EvidenceKindActiveAtPull)
//
// Design principles:
//   - ConsumeID and EvidenceID are parse-wide stable and deterministic, including
//     episode provenance (AppliedAt) so distinct applications get distinct IDs.
//   - Projected copies reuse IDs from the original episode, setting IsProjection=true.
//   - Only auras matching a dataset-scoped consumable catalog are emitted.
//   - Direct item SpellGo events are captured parse-wide (even outside combat)
//     so pre-pot uses are available for later encounter projection.
//
// Architecture:
//   - Tracker (tracker.go) is parse-wide, owned by encounters.State, and
//     processes every message once to record episodes.
//   - Collector (this file) is a lightweight per-instance hook that reads from
//     the shared Tracker and emits evidence into its instance's fight events.
package consumeevidence

import (
	"context"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
)

var _ instancehook.Hook = (*Collector)(nil)

// ConsumableCatalog provides dataset-scoped lookups for whether a given item
// or buff spell is a known consumable.
type ConsumableCatalog interface {
	// IsConsumableItem returns true if itemID is a known consumable.
	IsConsumableItem(itemID int32) bool
	// IsConsumableBuff returns true if spellID is a known consumable buff.
	// When true, candidateItemIDs contains the item IDs that can produce it.
	IsConsumableBuff(spellID chrondbc.SpellID) (candidateItemIDs []int32, ok bool)
}

// directEpisode records a parse-wide direct item-use event so that later aura
// events or encounter projections can correlate back to it.
type directEpisode struct {
	consumeID string
	player    guid.GUID
	itemID    int32
	spellData *chrondbc.Spell
	ts        time.Time
}

// auraEpisode records a consumable aura application for encounter projection
// and correlation with direct episodes.
type auraEpisode struct {
	consumeID string
	player    guid.GUID
	spellData *chrondbc.Spell
	appliedAt time.Time
	itemIDs   []int32 // candidate items (from catalog or direct episode)
}

// Collector is a per-instance hook that reads from a shared parse-wide Tracker
// and emits Consume messages into the active fight's event stream. It holds
// only per-encounter state (snapshot, dedup set).
type Collector struct {
	instancehook.BaseHook

	auraTracker *auras.Tracking
	shared      *Tracker
	emit        func(*messages.Consume)

	// Per-encounter state.
	snapshot          map[guid.GUID]map[chrondbc.SpellID]*auras.AuraState
	pendingProjection bool
	// emittedEvidenceIDs tracks evidence IDs emitted in the current encounter
	// to prevent duplicating a raw event and its projection on the pull-start.
	emittedEvidenceIDs map[string]struct{}
}

// NewCollector creates a Collector referencing the shared parse-wide Tracker
// and aura tracker.
func NewCollector(auraTracker *auras.Tracking, shared *Tracker) *Collector {
	return &Collector{auraTracker: auraTracker, shared: shared}
}

// SetEmit sets the callback used to inject Consume messages into the active
// fight's event stream.
func (c *Collector) SetEmit(fn func(*messages.Consume)) {
	c.emit = fn
}

// ProcessMessage emits evidence into the active encounter for messages that
// represent consumable item uses or buff gains. Episode recording is handled
// parse-wide by Tracker.Process; this method only emits.
func (c *Collector) ProcessMessage(active bool, _ uuid.UUID, m messages.Message) error {
	if !active || c.emit == nil {
		return nil
	}

	// Project pre-pull auras on first real (non-synthetic) message.
	if c.pendingProjection && !m.IsSynthetic() {
		c.emitProjection(m.Date())
		c.pendingProjection = false
	}

	// Emit direct item evidence for active encounters.
	if sg, ok := m.(*messages.SpellGo); ok && sg.ItemID != nil {
		catalog := c.shared.Catalog()
		if catalog == nil || catalog.IsConsumableItem(*sg.ItemID) {
			c.emitDirectEvidence(sg)
		}
	}

	// Emit aura evidence for consumable buffs during active encounters.
	if auraMsg, ok := m.(*messages.Aura); ok && auraMsg.State == 1 && auraMsg.IsBuff {
		c.emitAuraEvidence(auraMsg)
	}

	return nil
}

// emitDirectEvidence emits a direct item Consume event.
func (c *Collector) emitDirectEvidence(sg *messages.SpellGo) {
	ts := sg.Date()
	tsMilli := ts.UnixMilli()
	consumeID := StableConsumeID("direct", sg.Caster, sg.SpellData, sg.ItemID, ts)
	evidenceID := StableEvidenceID(consumeID, "spell_go")

	if c.isDuplicateEvidence(evidenceID) {
		return
	}

	c.emit(&messages.Consume{
		MessageBase:      messages.Base(ts),
		ConsumeID:        consumeID,
		EvidenceID:       evidenceID,
		Player:           sg.Caster,
		ItemID:           sg.ItemID,
		SpellData:        sg.SpellData,
		Kind:             messages.EvidenceKindDirectItem,
		Confidence:       messages.ConfidenceDirect,
		ConsumedAtUnixMs: &tsMilli,
		ObservedAtUnixMs: tsMilli,
	})
}

// emitAuraEvidence emits an aura-gain Consume event for a consumable buff.
func (c *Collector) emitAuraEvidence(auraMsg *messages.Aura) {
	if auraMsg.SpellData == nil {
		return
	}
	spellID := auraMsg.SpellData.ID
	catalog := c.shared.Catalog()

	var candidateItems []int32
	if catalog != nil {
		items, ok := catalog.IsConsumableBuff(chrondbc.SpellID(spellID))
		if !ok {
			return
		}
		candidateItems = items
	} else {
		return
	}

	ts := auraMsg.Date()
	tsMilli := ts.UnixMilli()

	// Try to correlate with a direct episode for shared consume ID.
	consumeID := ""
	confidence := messages.ConfidenceEffectDerived
	if len(candidateItems) > 1 {
		confidence = messages.ConfidenceAmbiguous
	}
	var itemID *int32
	if ep := c.shared.FindDirectEpisode(auraMsg.Target, spellID, candidateItems, ts); ep != nil {
		consumeID = ep.consumeID
		confidence = messages.ConfidenceDirect
		itemID = &ep.itemID
		candidateItems = nil // known item, no ambiguity
	} else {
		consumeID = StableAuraConsumeID(auraMsg.Target, chrondbc.SpellID(spellID), ts)
	}

	evidenceID := StableEvidenceID(consumeID, "aura")

	if c.isDuplicateEvidence(evidenceID) {
		return
	}

	c.emit(&messages.Consume{
		MessageBase:      messages.Base(ts),
		ConsumeID:        consumeID,
		EvidenceID:       evidenceID,
		Player:           auraMsg.Target,
		ItemID:           itemID,
		CandidateItemIDs: candidateItems,
		SpellData:        auraMsg.SpellData,
		Kind:             messages.EvidenceKindAura,
		Confidence:       confidence,
		ConsumedAtUnixMs: &tsMilli,
		ObservedAtUnixMs: tsMilli,
	})
}

// FightStarted snapshots the aura tracker for active-at-pull projection.
func (c *Collector) FightStarted(_ uuid.UUID, _ messages.Message) {
	if c.auraTracker != nil {
		c.snapshot = c.auraTracker.SnapshotAll()
	}
	c.pendingProjection = true
	c.emittedEvidenceIDs = make(map[string]struct{})
}

// FightEnded clears per-encounter state.
func (c *Collector) FightEnded(_ uuid.UUID, _ messages.Message) {
	c.clearEncounterState()
}

// Finalize clears per-encounter state.
func (c *Collector) Finalize(_ context.Context) error {
	c.clearEncounterState()
	return nil
}

// emitProjection emits active-at-pull evidence for consumable auras present
// in the snapshot. Uses deterministic IDs derived from the original aura
// episode so projected copies can be deduplicated.
func (c *Collector) emitProjection(ts time.Time) {
	if c.emit == nil || c.snapshot == nil {
		c.snapshot = nil
		return
	}
	catalog := c.shared.Catalog()

	tsMilli := ts.UnixMilli()

	for unitGUID, spells := range c.snapshot {
		if !unitGUID.IsPlayer() {
			continue
		}
		for spellID, aura := range spells {
			if !aura.Buff {
				continue
			}

			// Only project known consumable buffs.
			var candidateItems []int32
			if catalog != nil {
				items, ok := catalog.IsConsumableBuff(spellID)
				if !ok {
					continue
				}
				candidateItems = items
			} else {
				continue // No catalog means no projection
			}

			// Find the matching aura episode for this active aura to reuse
			// its consume ID. The episode's AppliedAt provides provenance so
			// distinct applications get distinct IDs.
			consumeID := ""
			var itemID *int32
			if ep := c.shared.FindAuraEpisode(unitGUID, spellID, aura.AppliedAt); ep != nil {
				consumeID = ep.consumeID
				if len(ep.itemIDs) == 1 {
					itemID = &ep.itemIDs[0]
					candidateItems = nil
				} else if len(ep.itemIDs) > 0 {
					candidateItems = ep.itemIDs
				}
			} else {
				// No recorded episode found; generate from aura state.
				consumeID = StableAuraConsumeID(unitGUID, spellID, aura.AppliedAt)
			}

			evidenceID := StableEvidenceID(consumeID, "active_at_pull")

			// Project the original direct observation when this aura was correlated
			// to an observed item use. Preserve its IDs and source timestamps so
			// copies across encounters deduplicate to one piece of evidence.
			if direct := c.shared.FindDirectEpisodeByConsumeID(consumeID); direct != nil {
				directEvidenceID := StableEvidenceID(consumeID, "spell_go")
				if !c.isDuplicateEvidence(directEvidenceID) {
					consumedAt := direct.ts.UnixMilli()
					projectedItemID := direct.itemID
					c.emit(&messages.Consume{
						MessageBase:      messages.Base(ts, messages.WithSynthetic()),
						ConsumeID:        consumeID,
						EvidenceID:       directEvidenceID,
						Player:           direct.player,
						ItemID:           &projectedItemID,
						SpellData:        direct.spellData,
						Kind:             messages.EvidenceKindDirectItem,
						Confidence:       messages.ConfidenceDirect,
						ConsumedAtUnixMs: &consumedAt,
						ObservedAtUnixMs: consumedAt,
						IsProjection:     true,
					})
				}
			}

			if c.isDuplicateEvidence(evidenceID) {
				continue
			}

			confidence := messages.ConfidenceEffectDerived
			if len(candidateItems) > 1 {
				confidence = messages.ConfidenceAmbiguous
			}
			c.emit(&messages.Consume{
				MessageBase:      messages.Base(ts, messages.WithSynthetic()),
				ConsumeID:        consumeID,
				EvidenceID:       evidenceID,
				Player:           unitGUID,
				ItemID:           itemID,
				CandidateItemIDs: candidateItems,
				SpellData:        aura.Spell,
				Kind:             messages.EvidenceKindActiveAtPull,
				Confidence:       confidence,
				ObservedAtUnixMs: tsMilli,
				IsProjection:     true,
			})
		}
	}
	c.snapshot = nil
}

// isDuplicateEvidence returns true if this evidence ID has already been emitted
// in the current encounter, preventing double-emit of raw + projected events
// at encounter start.
func (c *Collector) isDuplicateEvidence(evidenceID string) bool {
	if c.emittedEvidenceIDs == nil {
		c.emittedEvidenceIDs = make(map[string]struct{})
	}
	if _, ok := c.emittedEvidenceIDs[evidenceID]; ok {
		return true
	}
	c.emittedEvidenceIDs[evidenceID] = struct{}{}
	return false
}

func (c *Collector) clearEncounterState() {
	c.pendingProjection = false
	c.snapshot = nil
	c.emittedEvidenceIDs = nil
}
