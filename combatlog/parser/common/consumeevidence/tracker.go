// Package consumeevidence – tracker.go provides parse-wide consumable evidence
// tracking. The Tracker observes every combat-log message once (owned by
// encounters.State) and records direct item-use and consumable aura episodes.
// Lightweight per-instance Collectors read shared state from the Tracker to
// emit evidence into their encounter event streams.
package consumeevidence

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// Tracker holds parse-wide consumable evidence state. It must be created once
// per parse and its Process method called for every real message.
type Tracker struct {
	catalog ConsumableCatalog

	// directEpisodes records direct item-use events parse-wide.
	directEpisodes []directEpisode
	// auraEpisodes records consumable aura applications parse-wide.
	auraEpisodes []auraEpisode
	// preCombatEvidence holds observed out-of-combat instant consumes until the
	// next encounter starts. Evidence is drained exactly once by that encounter.
	preCombatEvidence []*messages.Consume
	// preCombatCastEpisodes correlate cast-only evidence with later effects.
	preCombatCastEpisodes []castEpisode
}

// NewTracker creates a parse-wide tracker. Pass nil catalog to disable
// aura-based evidence (direct item evidence is still captured).
func NewTracker(catalog ConsumableCatalog) *Tracker {
	return &Tracker{catalog: catalog}
}

// SetCatalog updates the catalog used for consumable lookups.
func (t *Tracker) SetCatalog(cat ConsumableCatalog) {
	t.catalog = cat
}

// Catalog returns the current catalog (may be nil).
func (t *Tracker) Catalog() ConsumableCatalog {
	return t.catalog
}

// Process observes a message and records consume episodes parse-wide. The
// optional active flag identifies whether the message belonged to an encounter;
// callers that omit it retain the historical in-combat behavior.
func (t *Tracker) Process(m messages.Message, active ...bool) {
	inCombat := true
	if len(active) > 0 {
		inCombat = active[0]
	}

	var direct *directEpisode
	if sg, ok := m.(*messages.SpellGo); ok && sg.ItemID != nil {
		direct = t.recordDirectEpisode(sg)
	}
	if auraMsg, ok := m.(*messages.Aura); ok && auraMsg.State == 1 && auraMsg.IsBuff {
		t.recordAuraEpisode(auraMsg)
	}
	if !inCombat {
		t.recordPreCombatEvidence(m, direct)
	}
}

func (t *Tracker) recordDirectEpisode(sg *messages.SpellGo) *directEpisode {
	if t.catalog != nil && !t.catalog.IsConsumableItem(*sg.ItemID) {
		return nil
	}
	ts := sg.Date()
	consumeID := StableConsumeID("direct", sg.Caster, sg.SpellData, sg.ItemID, ts)
	t.directEpisodes = append(t.directEpisodes, directEpisode{
		consumeID: consumeID,
		player:    sg.Caster,
		itemID:    *sg.ItemID,
		spellData: sg.SpellData,
		ts:        ts,
	})
	return &t.directEpisodes[len(t.directEpisodes)-1]
}

func (t *Tracker) recordAuraEpisode(auraMsg *messages.Aura) {
	if auraMsg.SpellData == nil {
		return
	}
	spellID := auraMsg.SpellData.ID

	var candidateItems []int32
	if t.catalog != nil {
		items, ok := t.catalog.IsConsumableBuff(chrondbc.SpellID(spellID))
		if !ok {
			return
		}
		candidateItems = items
	} else {
		return // No catalog means no aura evidence
	}

	ts := auraMsg.Date()

	consumeID := ""
	if ep := t.FindDirectEpisode(auraMsg.Target, spellID, candidateItems, ts); ep != nil {
		consumeID = ep.consumeID
		candidateItems = []int32{ep.itemID}
	} else {
		consumeID = StableAuraConsumeID(auraMsg.Target, chrondbc.SpellID(spellID), ts)
	}

	t.auraEpisodes = append(t.auraEpisodes, auraEpisode{
		consumeID: consumeID,
		player:    auraMsg.Target,
		spellData: auraMsg.SpellData,
		appliedAt: ts,
		itemIDs:   candidateItems,
	})
}

// recordPreCombatEvidence queues recognized instant consume evidence observed
// outside an encounter. Persistent aura evidence is projected separately from
// the active aura snapshot at pull time.
func (t *Tracker) recordPreCombatEvidence(m messages.Message, direct *directEpisode) {
	switch msg := m.(type) {
	case *messages.SpellGo:
		if msg.ItemID != nil {
			if direct != nil {
				t.queuePreCombatDirect(msg, direct)
			}
			return
		}
		t.queuePreCombatCast(msg)
	case *messages.Heal:
		t.queuePreCombatHeal(msg)
	case *messages.ResourceChange:
		t.queuePreCombatResource(msg)
	}
}

func (t *Tracker) queuePreCombatDirect(sg *messages.SpellGo, ep *directEpisode) {
	tsMilli := ep.ts.UnixMilli()
	itemID := ep.itemID
	t.preCombatEvidence = append(t.preCombatEvidence, &messages.Consume{
		MessageBase:      messages.Base(ep.ts),
		ConsumeID:        ep.consumeID,
		EvidenceID:       StableEvidenceID(ep.consumeID, "spell_go"),
		Player:           ep.player,
		ItemID:           &itemID,
		SpellData:        sg.SpellData,
		Kind:             messages.EvidenceKindDirectItem,
		Confidence:       messages.ConfidenceDirect,
		ConsumedAtUnixMs: &tsMilli,
		ObservedAtUnixMs: tsMilli,
	})
}

func (t *Tracker) queuePreCombatCast(sg *messages.SpellGo) {
	if sg.SpellData == nil || t.catalog == nil {
		return
	}
	candidateItems, ok := t.catalog.IsConsumableDirectSpell(chrondbc.SpellID(sg.SpellData.ID))
	if !ok {
		return
	}

	ts := sg.Date()
	tsMilli := ts.UnixMilli()
	consumeID := StableConsumeID("cast", sg.Caster, sg.SpellData, nil, ts)
	confidence := evidenceConfidence(candidateItems)
	t.preCombatCastEpisodes = append(t.preCombatCastEpisodes, castEpisode{
		consumeID:      consumeID,
		player:         sg.Caster,
		spellData:      sg.SpellData,
		candidateItems: append([]int32(nil), candidateItems...),
		ts:             ts,
	})
	t.preCombatEvidence = append(t.preCombatEvidence, &messages.Consume{
		MessageBase:      messages.Base(ts),
		ConsumeID:        consumeID,
		EvidenceID:       StableEvidenceID(consumeID, "cast"),
		Player:           sg.Caster,
		CandidateItemIDs: candidateItems,
		SpellData:        sg.SpellData,
		Kind:             messages.EvidenceKindCast,
		Confidence:       confidence,
		ConsumedAtUnixMs: &tsMilli,
		ObservedAtUnixMs: tsMilli,
	})
}

func (t *Tracker) queuePreCombatHeal(heal *messages.Heal) {
	if heal.SpellData == nil || heal.Caster != heal.Target || t.catalog == nil {
		return
	}
	candidateItems, ok := t.catalog.IsConsumableDirectSpell(chrondbc.SpellID(heal.SpellData.ID))
	if !ok {
		return
	}

	ts := heal.Date()
	tsMilli := ts.UnixMilli()
	consumeID, itemID, confidence := t.correlatePreCombatEffect(
		heal.Caster,
		chrondbc.SpellID(heal.SpellData.ID),
		candidateItems,
		ts,
		"heal",
		heal.SpellData,
	)
	if itemID != nil {
		candidateItems = nil
	}
	amount := heal.Amount + heal.Overheal
	resourceType := "Health"
	t.preCombatEvidence = append(t.preCombatEvidence, &messages.Consume{
		MessageBase:      messages.Base(ts),
		ConsumeID:        consumeID,
		EvidenceID:       StableEvidenceID(consumeID, "heal"),
		Player:           heal.Caster,
		ItemID:           itemID,
		CandidateItemIDs: candidateItems,
		SpellData:        heal.SpellData,
		Kind:             messages.EvidenceKindHeal,
		Confidence:       confidence,
		ConsumedAtUnixMs: &tsMilli,
		ObservedAtUnixMs: tsMilli,
		Amount:           &amount,
		ResourceType:     &resourceType,
	})
}

func (t *Tracker) queuePreCombatResource(change *messages.ResourceChange) {
	if change.SpellData == nil || t.catalog == nil || string(change.Direction) != "Gain" {
		return
	}
	candidateItems, ok := t.catalog.IsConsumableDirectSpell(chrondbc.SpellID(change.SpellData.ID))
	if !ok {
		return
	}

	ts := change.Date()
	tsMilli := ts.UnixMilli()
	consumeID, itemID, confidence := t.correlatePreCombatEffect(
		change.Target,
		chrondbc.SpellID(change.SpellData.ID),
		candidateItems,
		ts,
		"resource",
		change.SpellData,
	)
	if itemID != nil {
		candidateItems = nil
	}
	amount := change.Amount + change.OverResource
	resourceType := string(change.Resource)
	t.preCombatEvidence = append(t.preCombatEvidence, &messages.Consume{
		MessageBase:      messages.Base(ts),
		ConsumeID:        consumeID,
		EvidenceID:       StableEvidenceID(consumeID, "resource"),
		Player:           change.Target,
		ItemID:           itemID,
		CandidateItemIDs: candidateItems,
		SpellData:        change.SpellData,
		Kind:             messages.EvidenceKindResource,
		Confidence:       confidence,
		ConsumedAtUnixMs: &tsMilli,
		ObservedAtUnixMs: tsMilli,
		Amount:           &amount,
		ResourceType:     &resourceType,
	})
}

func (t *Tracker) correlatePreCombatEffect(
	player guid.GUID,
	spellID chrondbc.SpellID,
	candidateItems []int32,
	ts time.Time,
	kind string,
	spell *chrondbc.Spell,
) (string, *int32, messages.EvidenceConfidence) {
	confidence := evidenceConfidence(candidateItems)
	if ep := t.FindDirectEpisode(player, spellID, candidateItems, ts); ep != nil {
		itemID := ep.itemID
		return ep.consumeID, &itemID, messages.ConfidenceDirect
	}
	if ep := t.findPreCombatCastEpisode(player, spellID, candidateItems, ts); ep != nil {
		return ep.consumeID, nil, confidence
	}
	return StableConsumeID(kind, player, spell, nil, ts), nil, confidence
}

func (t *Tracker) findPreCombatCastEpisode(
	player guid.GUID,
	spellID chrondbc.SpellID,
	candidateItems []int32,
	observedAt time.Time,
) *castEpisode {
	const correlationWindow = 2 * time.Second
	for i := len(t.preCombatCastEpisodes) - 1; i >= 0; i-- {
		ep := &t.preCombatCastEpisodes[i]
		if observedAt.Sub(ep.ts) > correlationWindow {
			break
		}
		if ep.player != player {
			continue
		}
		if ep.spellData != nil && ep.spellData.ID == spellID {
			return ep
		}
		for _, observedItem := range candidateItems {
			for _, castItem := range ep.candidateItems {
				if observedItem == castItem {
					return ep
				}
			}
		}
	}
	return nil
}

func evidenceConfidence(candidateItems []int32) messages.EvidenceConfidence {
	if len(candidateItems) > 1 {
		return messages.ConfidenceAmbiguous
	}
	return messages.ConfidenceEffectDerived
}

// DrainPreCombatEvidence returns every out-of-combat instant consume observed
// since the previous encounter and clears the queue for the next encounter.
func (t *Tracker) DrainPreCombatEvidence() []*messages.Consume {
	evidence := t.preCombatEvidence
	t.preCombatEvidence = nil
	t.preCombatCastEpisodes = nil
	return evidence
}

// FindDirectEpisode finds a recent direct episode matching the given aura.
func (t *Tracker) FindDirectEpisode(player guid.GUID, spellID chrondbc.SpellID, candidateItems []int32, auraTime time.Time) *directEpisode {
	const correlationWindow = 2 * time.Second
	for i := len(t.directEpisodes) - 1; i >= 0; i-- {
		ep := &t.directEpisodes[i]
		if auraTime.Sub(ep.ts) > correlationWindow {
			break
		}
		if ep.player != player {
			continue
		}
		if ep.spellData != nil && ep.spellData.ID == spellID {
			return ep
		}
		for _, itemID := range candidateItems {
			if ep.itemID == itemID {
				return ep
			}
		}
	}
	return nil
}

// FindAuraEpisode finds a previously recorded aura episode for the given
// player, spell, and application time. This scans all aura episodes, which is
// acceptable because a parse currently records at most low hundreds of them;
// callers should not move it onto a per-message hot path without indexing.
func (t *Tracker) FindAuraEpisode(player guid.GUID, spellID chrondbc.SpellID, appliedAt time.Time) *auraEpisode {
	for i := len(t.auraEpisodes) - 1; i >= 0; i-- {
		ep := &t.auraEpisodes[i]
		if ep.player == player && ep.spellData != nil &&
			chrondbc.SpellID(ep.spellData.ID) == spellID &&
			ep.appliedAt.Equal(appliedAt) {
			return ep
		}
	}
	return nil
}

// FindDirectEpisodeByConsumeID returns the direct observation correlated to an
// aura episode, if one exists. Like FindAuraEpisode, this assumes the episode
// collection remains small and is only called during encounter projection.
func (t *Tracker) FindDirectEpisodeByConsumeID(consumeID string) *directEpisode {
	for i := len(t.directEpisodes) - 1; i >= 0; i-- {
		if t.directEpisodes[i].consumeID == consumeID {
			return &t.directEpisodes[i]
		}
	}
	return nil
}

// DirectEpisodeCount returns the number of recorded direct episodes (for testing).
func (t *Tracker) DirectEpisodeCount() int {
	return len(t.directEpisodes)
}

// --- Stable ID generation (package-level for sharing) ---

// StableConsumeID produces a deterministic consume ID from the key components.
func StableConsumeID(kind string, player guid.GUID, spell *chrondbc.Spell, itemID *int32, ts time.Time) string {
	spellID := ""
	if spell != nil {
		spellID = strconv.Itoa(int(spell.ID))
	}
	itemIDString := ""
	if itemID != nil {
		itemIDString = strconv.Itoa(int(*itemID))
	}
	return stableID(
		kind,
		player.String(),
		spellID,
		itemIDString,
		strconv.FormatInt(ts.UnixMilli(), 10),
	)
}

// StableAuraConsumeID produces a deterministic consume ID for an aura-derived
// episode.
func StableAuraConsumeID(player guid.GUID, spellID chrondbc.SpellID, appliedAt time.Time) string {
	return stableID(
		"aura",
		player.String(),
		strconv.Itoa(int(spellID)),
		strconv.FormatInt(appliedAt.UnixMilli(), 10),
	)
}

// StableEvidenceID produces a deterministic evidence ID from the consume ID
// and the observation kind.
func StableEvidenceID(consumeID string, observationKind string) string {
	return stableID(consumeID, observationKind)
}

func stableID(parts ...string) string {
	h := sha256.New()
	for _, part := range parts {
		h.Write([]byte(part))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}
