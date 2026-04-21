package registry

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/internal/services"
)

// InstanceFactory creates a new instance
type InstanceFactory func(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *instances.Hookable

// DefaultRegistry returns a registry with all known instances
func DefaultRegistry(logger *slog.Logger) *Registry {
	switch services.ServerName {
	case services.ServerIdentityTurtle:
		return TurtleRegistry(logger)
	case services.ServerIdentityWarmane:
		return WarmaneRegistry(logger)
	default:
		return TurtleRegistry(logger)
	}
}

// Registry manages available instances
type Registry struct {
	factories      map[string]InstanceFactory
	factoryComment map[string]string
	logger         *slog.Logger
}

// NewRegistry creates a new instance registry
func NewRegistry(logger *slog.Logger) *Registry {
	return &Registry{
		factories:      make(map[string]InstanceFactory),
		factoryComment: make(map[string]string),
		logger:         logger,
	}
}

func (r *Registry) RegisterWithComment(factory InstanceFactory, comment string) {
	// temporary instance to get the name
	tmp := factory(nil, nil, nil, zone.Zone{})
	name := tmp.Name()
	if _, exists := r.factories[name]; exists {
		panic(fmt.Sprintf("instance factory named %s already exists", name))
	}
	r.factories[name] = factory
	r.factoryComment[name] = comment
}

// Register adds an instance factory to the registry
func (r *Registry) Register(factory InstanceFactory) {
	// temporary instance to get the name
	tmp := factory(nil, nil, nil, zone.Zone{})
	name := tmp.Name()
	if _, exists := r.factories[name]; exists {
		panic(fmt.Sprintf("instance factory named %s already exists", name))
	}
	r.factories[name] = factory
}

// GetInstance returns an instance for the given zone, or nil if none match
func (r *Registry) GetInstance(verbose bool, z zone.Zone, db *unitdb.Units) *instances.Hookable {
	for name, factory := range r.factories {
		// Create a temporary instance to check if it matches
		inst := factory(parseoptions.WithVerbose(context.Background(), verbose), r.logger, db, z)
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

func (r *Registry) AllInstancesWithComments() map[string]string {
	all := make(map[string]string)
	for name := range r.factories {
		comment := r.factoryComment[name]
		all[name] = comment
	}
	return all
}

func wrap(do func(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *instances.Hookable) InstanceFactory {
	return func(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *instances.Hookable {
		return do(ctx, logger, db, z)
	}
}
