package registry

import (
	"context"
	"fmt"
	"log/slog"
	"sort"

	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

// InstanceFactory creates a new instance
type InstanceFactory func(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone, flavor database.WoWFlavor) *instances.Hookable

// Entry holds metadata and a factory for a single registered instance.
type Entry struct {
	// Name is the instance display name (e.g. "Deadmines").
	Name string
	// Comment is an optional note (e.g. "not fully implemented").
	Comment string
	// Factory creates a Hookable for this instance.
	Factory InstanceFactory
	// MultiZone means this is a registry of more than 1 unique instance sharing the same zone.
	// AKA: Scarlet Monastery
	MultiZone bool

	// ZoneNames are the lowercase zone name(s) this instance matches.
	ZoneNames []string
	// HostileEntries are the creature entry IDs for this instance.
	HostileEntries map[uint32]instances.Identity
	// SpeedrunRules holds the speedrun rules captured at registration time.
	SpeedrunRules *rankings.SpeedrunRules
	// DerivedSpeedrunRules holds per-sub-instance speedrun rules when
	// the factory uses DerivedRankings (e.g. Lower/Upper Tower of Karazhan).
	DerivedSpeedrunRules map[string]*rankings.SpeedrunRules
}

// WithComment returns a copy of the Entry with Comment set.
func (e Entry) WithComment(comment string) Entry {
	e.Comment = comment
	return e
}

func FromFlavoredFactory(flavor database.WoWFlavor, f *instances.CommonFactory) Entry {
	var hostiles map[uint32]instances.Identity
	if f.Hostiles != nil {
		id := f.Hostiles(flavor)
		hostiles = id.HostileEntries()
	}

	var speedrun *rankings.SpeedrunRules
	if f.FlavoredRankings != nil {
		if r := f.FlavoredRankings(flavor); r != nil {
			speedrun = r.Speedrun
		}
	}

	entry := Entry{
		Name:           f.Name,
		MultiZone:      f.MultiZone,
		Factory:        wrap(f.New),
		ZoneNames:      f.ZoneNames,
		HostileEntries: hostiles,
		SpeedrunRules:  speedrun,
	}

	// When DerivedRankings are present, collect per-sub-instance speedrun rules
	// so they can be discovered via the registry (e.g. for admin/display).
	if f.DerivedRankings != nil {
		entry.DerivedSpeedrunRules = make(map[string]*rankings.SpeedrunRules, len(f.DerivedRankings))
		for name, rankingsFn := range f.DerivedRankings {
			if r := rankingsFn(flavor); r != nil && r.Speedrun != nil {
				entry.DerivedSpeedrunRules[name] = r.Speedrun
			}
		}
	}

	return entry
}

// FromCommonFactory builds an Entry from a CommonFactory, extracting
// zone names, hostile entries, and the factory function.
func FromCommonFactory(f *instances.CommonFactory) Entry {
	return FromFlavoredFactory(database.WoWFlavor{}, f)
}

// RegistryForFlavor returns an instance registry based on flavor tags.
// This allows a single binary to serve multiple WoW versions by selecting
// the right encounter definitions at parse time.
func RegistryForFlavor(logger *slog.Logger, flavor database.WoWFlavor) *Registry {
	r := NewRegistry(logger, flavor)
	RegisterClassicEncounters(r)

	if flavor.Has(database.FlavorNightmareOfUrsol) {
		RegisterNightmareOfUrsol(r)
	}

	if flavor.Has(database.FlavorWrath) || flavor.Has(database.FlavorTBC) {
		RegisterTBCEncounters(r)
	}

	if flavor.Has(database.FlavorWrath) {
		RegisterWrath(r)
	}
	return r
}

// Registry manages available instances
type Registry struct {
	entries  map[string]*Entry
	logger   *slog.Logger
	fallback *Registry
	flavor   database.WoWFlavor
}

// NewRegistry creates a new instance registry
func NewRegistry(logger *slog.Logger, flavor database.WoWFlavor) *Registry {
	return &Registry{
		entries: make(map[string]*Entry),
		logger:  logger,
		flavor:  flavor,
	}
}

func (r *Registry) Flavor() database.WoWFlavor {
	return r.flavor
}

func (r *Registry) DeleteEntry(name string) {
	delete(r.entries, name)
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
	tmp := factory(nil, nil, nil, zone.Zone{}, database.WoWFlavor{})
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
	tmp := factory(nil, nil, nil, zone.Zone{}, database.WoWFlavor{})
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
func (r *Registry) GetInstance(ctx context.Context, verbose bool, z zone.Zone, db *unitdb.Units, flavor database.WoWFlavor) *instances.Hookable {
	for _, entry := range r.entries {
		// Create a temporary instance to check if it matches
		inst := entry.Factory(parseoptions.WithVerbose(ctx, verbose), r.logger, db, z, flavor)
		if inst.MatchesZone(z) {
			r.logger.Debug("matched instance",
				slog.String("zone", z.Name),
				slog.String("instance", entry.Name),
			)
			return inst
		}
	}
	if r.fallback != nil {
		return r.fallback.GetInstance(ctx, verbose, z, db, flavor)
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

// SpeedrunRules returns speedrun rules for every registered instance that has
// them, keyed by instance name. Includes fallback entries.
func (r *Registry) SpeedrunRules() map[string]*rankings.SpeedrunRules {
	m := make(map[string]*rankings.SpeedrunRules)
	if r.fallback != nil {
		for k, v := range r.fallback.SpeedrunRules() {
			m[k] = v
		}
	}
	for _, entry := range r.entries {
		if entry.SpeedrunRules != nil {
			m[entry.Name] = entry.SpeedrunRules
		}
		for name, rules := range entry.DerivedSpeedrunRules {
			m[name] = rules
		}
	}
	return m
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
				if !id.CanBattle() {
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

func wrap(do func(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone, flavor database.WoWFlavor) *instances.Hookable) InstanceFactory {
	return func(ctx context.Context, logger *slog.Logger, db *unitdb.Units, z zone.Zone, flavor database.WoWFlavor) *instances.Hookable {
		return do(ctx, logger, db, z, flavor)
	}
}
