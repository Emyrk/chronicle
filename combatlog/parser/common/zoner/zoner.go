package zoner

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/internal/ptr"
)

type Location struct {
	synthetic *bool
	zone.Zone
}

func NewLocation() *Location {
	return &Location{
		Zone: zone.Zone{},
	}
}

func (l *Location) Process(z messages.Zone) zone.ZoneChangeResult {
	if z.Name == "" {
		// Ignore empty zones
		return zone.NoChange
	}

	if l.synthetic != nil && !*l.synthetic && z.Synthetic {
		// Synthetic zones can't override non-synthetic zones within the same zone
		// (preserves difficulty/metadata from real messages). But a synthetic zone
		// CAN trigger a change to a different zone (e.g., instance change before
		// the real ZONE_INFO arrives).
		if l.Name == z.Name {
			return zone.NoChange
		}
	}

	// At this point we track the "synthetic" property and propagate it properly
	l.setSynthetic(z.Synthetic)

	if !l.Equal(z.Zone) {
		l.Zone = z.Zone
		return zone.ZoneChanged
	}

	// Same zone (name + instanceID match). Check for difficulty changes.
	if z.HasDifficulty() {
		if l.DifficultyDiffers(z.Zone) {
			// Difficulty was already set and now differs → new instance needed.
			l.Zone = z.Zone
			return zone.DifficultyChanged
		}
		if !l.HasDifficulty() {
			// Adopt late-arriving difficulty info in place.
			l.DifficultyIndex = z.DifficultyIndex
			l.DifficultyName = z.DifficultyName
			l.MaxPlayers = z.MaxPlayers
			l.DynamicDifficulty = z.DynamicDifficulty
			l.SubZone = z.SubZone
			return zone.InfoUpdated
		}
	}
	return zone.NoChange
}

func (l *Location) setSynthetic(synthetic bool) {
	if l.synthetic == nil {
		l.synthetic = &synthetic
		return
	}

	// Once set to false, it should never become true again. Synthetic zones should
	// never override a real zone.
	l.synthetic = ptr.Ref(*l.synthetic && synthetic)
}
