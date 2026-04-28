package registry

import (
	"context"
	"fmt"
	"log/slog"
	"sort"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/internal/services"
)

// InstanceFactory creates a new instance
type InstanceFactory func(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *instances.Hookable

// Entry holds metadata and a factory for a single registered instance.
type Entry struct {
	// Name is the instance display name (e.g. "Deadmines").
	Name string
	// Comment is an optional note (e.g. "not fully implemented").
	Comment string
	// Factory creates a Hookable for this instance.
	Factory InstanceFactory

	// ZoneNames are the lowercase zone name(s) this instance matches.
	ZoneNames []string
	// HostileEntries are the creature entry IDs for this instance.
	HostileEntries map[uint32]instances.Identity
}

// WithComment returns a copy of the Entry with Comment set.
func (e Entry) WithComment(comment string) Entry {
	e.Comment = comment
	return e
}

// FromCommonFactory builds an Entry from a CommonFactory, extracting
// zone names, hostile entries, and the factory function.
func FromCommonFactory(f *instances.CommonFactory) Entry {
	var hostiles map[uint32]instances.Identity
	if f.Hostiles != nil {
		hostiles = f.Hostiles().HostileEntries()
	}

	return Entry{
		Name:           f.Name,
		Factory:        wrap(f.New),
		ZoneNames:      f.ZoneNames,
		HostileEntries: hostiles,
	}
}

// DefaultRegistry returns a registry with all known instances.
// When store and serverID are provided, the caller can use them to create
// a DB-backed registry wrapping the static one. This function only returns
// the static registry; the DB wrapping is done by the caller.
func DefaultRegistry(logger *slog.Logger) *Registry {
	switch services.ServerName {
	case services.ServerIdentityTurtle:
		return TurtleRegistry(logger)
	case services.ServerIdentityWarmane:
		return WarmaneStaticRegistry(logger)
	case services.ServerIdentityEpoch:
		return TurtleRegistry(logger)
	default:
		return TurtleRegistry(logger)
	}
}

// Registry manages available instances
type Registry struct {
	entries  map[string]*Entry
	logger   *slog.Logger
	fallback *Registry
}

// NewRegistry creates a new instance registry
func NewRegistry(logger *slog.Logger) *Registry {
	return &Registry{
		entries: make(map[string]*Entry),
		logger:  logger,
	}
}

// SetFallback sets a fallback registry consulted when no entry in this
// registry matches a zone. This allows DB-loaded entries to take priority
// while still falling through to code-registered instances.
func (r *Registry) SetFallback(fb *Registry) {
	r.fallback = fb
}

// RegisterEntry adds an entry with full metadata to the registry.
func (r *Registry) RegisterEntry(e Entry) {
	if _, exists := r.entries[e.Name]; exists {
		panic(fmt.Sprintf("instance factory named %s already exists", e.Name))
	}
	r.entries[e.Name] = &e
}

func (r *Registry) RegisterWithComment(factory InstanceFactory, comment string) {
	// temporary instance to get the name
	tmp := factory(nil, nil, nil, zone.Zone{})
	name := tmp.Name()
	if _, exists := r.entries[name]; exists {
		panic(fmt.Sprintf("instance factory named %s already exists", name))
	}
	r.entries[name] = &Entry{
		Name:    name,
		Comment: comment,
		Factory: factory,
	}
}

// Register adds an instance factory to the registry
func (r *Registry) Register(factory InstanceFactory) {
	// temporary instance to get the name
	tmp := factory(nil, nil, nil, zone.Zone{})
	name := tmp.Name()
	if _, exists := r.entries[name]; exists {
		panic(fmt.Sprintf("instance factory named %s already exists", name))
	}
	r.entries[name] = &Entry{
		Name:    name,
		Factory: factory,
	}
}

// GetInstance returns an instance for the given zone, or nil if none match
func (r *Registry) GetInstance(verbose bool, z zone.Zone, db *unitdb.Units) *instances.Hookable {
	for _, entry := range r.entries {
		// Create a temporary instance to check if it matches
		inst := entry.Factory(parseoptions.WithVerbose(context.Background(), verbose), r.logger, db, z)
		if inst.MatchesZone(z) {
			r.logger.Debug("matched instance",
				slog.String("zone", z.Name),
				slog.String("instance", entry.Name),
			)
			return inst
		}
	}
	if r.fallback != nil {
		return r.fallback.GetInstance(verbose, z, db)
	}
	return nil
}

// Entries returns all registered entries for external iteration.
func (r *Registry) Entries() map[string]*Entry {
	return r.entries
}

// EntryByName returns a single entry by instance name, or nil if not found.
func (r *Registry) EntryByName(name string) *Entry {
	return r.entries[name]
}

// AllInstances returns all registered instance names
func (r *Registry) AllInstances() []string {
	names := make([]string, 0, len(r.entries))
	for name := range r.entries {
		names = append(names, name)
	}
	return names
}

func (r *Registry) AllInstancesWithComments() map[string]string {
	all := make(map[string]string)
	if r.fallback != nil {
		for k, v := range r.fallback.AllInstancesWithComments() {
			all[k] = fmt.Sprintf("%s (fallback)", v)
		}
	}
	for name, entry := range r.entries {
		all[name] = entry.Comment
	}
	return all
}
// InstanceDetailUnit is a hostile creature entry ID + display name.
type InstanceDetailUnit struct {
	EntryID uint32
	Name    string
}

// InstanceDetail holds enriched metadata for a registered instance.
type InstanceDetail struct {
	Name      string
	Comment   string
	Fallback  bool
	ZoneNames []string
	Bosses    []InstanceDetailUnit
	Trash     []InstanceDetailUnit
}

// AllInstanceDetails returns enriched metadata for every registered instance,
// including zone names, boss names, and trash mob names.
func (r *Registry) AllInstanceDetails() []InstanceDetail {
	seen := make(map[string]struct{})
	var result []InstanceDetail

	collect := func(reg *Registry, fallback bool) {
		for _, entry := range reg.entries {
			if _, ok := seen[entry.Name]; ok {
				continue
			}
			seen[entry.Name] = struct{}{}

			var bosses, trash []InstanceDetailUnit
			for entryID, id := range entry.HostileEntries {
				if !id.Hostile {
					continue
				}
				u := InstanceDetailUnit{EntryID: entryID, Name: id.Name}
				if id.Boss {
					bosses = append(bosses, u)
				} else {
					trash = append(trash, u)
				}
			}
			sort.Slice(bosses, func(i, j int) bool { return bosses[i].Name < bosses[j].Name })
			sort.Slice(trash, func(i, j int) bool { return trash[i].Name < trash[j].Name })

			result = append(result, InstanceDetail{
				Name:      entry.Name,
				Comment:   entry.Comment,
				Fallback:  fallback,
				ZoneNames: entry.ZoneNames,
				Bosses:    bosses,
				Trash:     trash,
			})
		}
	}

	collect(r, false)
	if r.fallback != nil {
		collect(r.fallback, true)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result
}

func wrap(do func(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *instances.Hookable) InstanceFactory {
	return func(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone) *instances.Hookable {
		return do(ctx, logger, db, z)
	}
}
