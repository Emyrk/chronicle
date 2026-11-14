package zonedetector

import (
	"fmt"
	"log/slog"
	"maps"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
)

// State includes the effective registry-derived index, not a recipe selected by
// an archive. Runtime wiring must verify it against the caller's fresh registry.
type State struct {
	Entries map[uint32]string `json:"entries"`
	Current string            `json:"current"`
}

func (z *ZoneDetector) CaptureState() State { return State{maps.Clone(z.entryToZone), z.currentZone} }
func (s State) Restore() (*ZoneDetector, error) {
	if s.Entries == nil {
		return nil, fmt.Errorf("missing zone index")
	}
	return &ZoneDetector{entryToZone: maps.Clone(s.Entries), currentZone: s.Current}, nil
}
func (z *ZoneDetector) ValidateGraphRuntime(reg *registry.Registry) error {
	if reg == nil {
		return fmt.Errorf("zone registry required")
	}
	fresh := New(nil, reg)
	if !maps.Equal(z.entryToZone, fresh.entryToZone) {
		return fmt.Errorf("zone registry differs from captured configuration")
	}
	return nil
}
func (z *ZoneDetector) WireGraphRuntime(logger *slog.Logger) { z.logger = logger }
