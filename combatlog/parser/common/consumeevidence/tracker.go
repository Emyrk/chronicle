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

// Process observes a message and records any direct or aura episodes. Call
// once for every real message at the parse level.
func (t *Tracker) Process(m messages.Message) {
	if sg, ok := m.(*messages.SpellGo); ok && sg.ItemID != nil {
		t.recordDirectEpisode(sg)
	}
	if auraMsg, ok := m.(*messages.Aura); ok && auraMsg.State == 1 && auraMsg.IsBuff {
		t.recordAuraEpisode(auraMsg)
	}
}

func (t *Tracker) recordDirectEpisode(sg *messages.SpellGo) {
	if t.catalog != nil && !t.catalog.IsConsumableItem(*sg.ItemID) {
		return
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
