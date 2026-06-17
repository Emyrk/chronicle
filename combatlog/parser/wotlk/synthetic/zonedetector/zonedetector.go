package zonedetector

import (
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
)

// ZoneDetector infers the current zone from creature entry IDs seen in combat.
// WotLK logs lack ZONE_CHANGED events, so we match creature entries against
// known instance hostile lists and emit synthetic Zone messages.
type ZoneDetector struct {
	// entryToZone maps creature entry ID → zone name (lowercase).
	entryToZone map[uint32]string
	currentZone string
	logger      *slog.Logger
}

// New builds a ZoneDetector from a registry, indexing all hostile entries
// across all registered instances.
func New(logger *slog.Logger, reg *registry.Registry) *ZoneDetector {
	lookup := make(map[uint32]string)
	notUnique := make(map[uint32]struct{})

	for _, entry := range reg.Entries() {
		if entry.MultiZone {
			continue
		}
		for entryID := range entry.HostileEntries {
			for _, zn := range entry.ZoneNames {
				_, exists := notUnique[entryID]
				if exists {
					continue
				}

				_, exists = lookup[entryID]
				if exists {
					delete(lookup, entryID)
					notUnique[entryID] = struct{}{}
					continue
				}

				lookup[entryID] = zn
				break // one zone name per entry is sufficient
			}
		}
	}
	return &ZoneDetector{
		entryToZone: lookup,
		logger:      logger,
	}
}

// ProcessMessages scans messages for creature GUIDs that belong to a known
// instance. When a new zone is detected, a synthetic Zone message is prepended.
func (zd *ZoneDetector) ProcessMessages(msgs []messages.Message) []messages.Message {
	if zd == nil {
		return msgs
	}

	for _, msg := range msgs {
		switch ty := msg.(type) {
		case *messages.Zone:
			if !ty.Synthetic {
				// A real zone message is authoritative — sync our tracking
				// so we don't redundantly emit a synthetic for the same zone.
				zd.currentZone = ty.Name
				continue
			}
		}

		for _, g := range msg.Affects() {
			entry, ok := g.GetEntry()
			if !ok {
				continue
			}
			zoneName, ok := zd.entryToZone[entry]
			if !ok {
				continue
			}
			if zoneName == zd.currentZone {
				continue
			}
			zd.currentZone = zoneName

			synthetic := &messages.Zone{
				MessageBase: messages.Base(msg.Date(), messages.WithSynthetic()),
				Zone: zone.Zone{
					Seen:       msg.Date(),
					Name:       zoneName,
					IsInstance: true,
				},
			}
			zd.logger.Info("detected zone change",
				slog.String("zone", zoneName),
				slog.Time("timestamp", msg.Date()),
				slog.Uint64("unit", uint64(entry)),
			)
			return append([]messages.Message{synthetic}, msgs...)
		}
	}
	return msgs
}

// LastZone returns the most recently detected zone name, or "" if none.
func (zd *ZoneDetector) LastZone() string {
	return zd.currentZone
}
