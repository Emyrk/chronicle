package encounters

import (
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

// InstanceFactory creates a new instance
type InstanceFactory func(logger *slog.Logger, db *unitdb.Units, z zone.Zone) Instance

// Registry manages available instances
type Registry struct {
	factories map[string]InstanceFactory
	logger    *slog.Logger
}

// NewRegistry creates a new instance registry
func NewRegistry(logger *slog.Logger) *Registry {
	return &Registry{
		factories: make(map[string]InstanceFactory),
		logger:    logger,
	}
}

// Register adds an instance factory to the registry
func (r *Registry) Register(name string, factory InstanceFactory) {
	r.factories[name] = factory
	r.logger.Debug("registered instance", slog.String("name", name))
}

// GetInstance returns an instance for the given zone, or nil if none match
func (r *Registry) GetInstance(z zone.Zone, db *unitdb.Units) Instance {
	for name, factory := range r.factories {
		// Create a temporary instance to check if it matches
		inst := factory(r.logger, db, z)
		if inst.MatchesZone(z) {
			r.logger.Debug("matched instance",
				slog.String("zone", z.Name),
				slog.String("instance", name),
			)
			return inst
		}
	}
	return nil
}

// AllInstances returns all registered instance names
func (r *Registry) AllInstances() []string {
	names := make([]string, 0, len(r.factories))
	for name := range r.factories {
		names = append(names, name)
	}
	return names
}

// DefaultRegistry returns a registry with all known instances
func DefaultRegistry(logger *slog.Logger) *Registry {
	r := NewRegistry(logger)
	
	// Register instances here as you add them
	// Example:
	// r.Register("Scarlet Monastery Cathedral", smcathedral.New)
	// r.Register("Molten Core", moltencore.New)
	// r.Register("Onyxia's Lair", onyxia.New)
	
	return r
}
