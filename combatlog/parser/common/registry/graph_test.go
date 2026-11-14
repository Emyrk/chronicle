package registry

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func graphCompatibility(format database.LogFormat, flavor database.WoWFlavor) snapshot.Compatibility {
	return snapshot.Compatibility{DatasetID: "00000000-0000-0000-0000-000000000005", DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: string(format), Flavor: flavor.CanonicalKey()}
}

func TestPreparedGraphVanillaRegistryCoverage(t *testing.T) {
	t.Parallel()
	flavors := []database.WoWFlavor{{database.FlavorVanilla}}
	for _, server := range []string{"turtle", "kronos", "vanillaplus", "octowow", "wow-forever"} {
		flavors = append(flavors, database.ServerFlavor(server, database.FlavorVanilla))
	}
	// Content selectors compose independently; cover every combination as well.
	for mask := 1; mask < 8; mask++ {
		f := database.WoWFlavor{database.FlavorVanilla}
		for i, tag := range []database.FlavorTag{database.FlavorNightmareOfUrsol, database.FlavorVanillaPlus, database.FlavorWoWForever} {
			if mask&(1<<i) != 0 {
				f = append(f, tag)
			}
		}
		flavors = append(flavors, f)
	}
	for _, format := range []database.LogFormat{database.LogFormat112aCcAddon, database.LogFormat112aSuperwowAddon} {
		for _, flavor := range flavors {
			t.Run(string(format)+"/"+flavor.CanonicalKey(), func(t *testing.T) {
				t.Parallel()
				registry := RegistryForFlavor(slog.Default(), flavor)
				p, err := registry.PrepareGraph(format, &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, nil)
				require.NoError(t, err)
				require.Len(t, p.hooks, len(registry.entries))
				require.Len(t, p.identifiers, len(registry.entries))
				require.NotEmpty(t, p.factories.Factories)
				require.Len(t, p.factories.FactoryIDs, len(p.factories.Factories))
				require.NoError(t, p.RegisterOwners(ownergraph.NewRegistry(), graphCompatibility(format, flavor), nil))
				ctx := parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: flavor})
				for i, hook := range p.hooks {
					id, err := p.identifiers[i].New()
					require.NoError(t, err)
					h, err := hook.New(ctx, slog.Default(), unitdb.New(), zone.Zone{Name: hook.Name, IsInstance: true}, id)
					require.NoError(t, err, hook.Name)
					require.Equal(t, hook.Name, h.Name())
				}
			})
		}
	}
}

func TestPreparedGraphRejectsUnsupported(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorVanilla}
	for _, format := range []database.LogFormat{database.LogFormat243CcAddon, "unknown"} {
		_, err := RegistryForFlavor(nil, flavor).PrepareGraph(format, nil, nil, nil)
		require.Error(t, err)
	}
	for _, f := range []database.WoWFlavor{nil, {database.FlavorTBC}, {database.FlavorVanilla, database.FlavorWrath}, {database.FlavorVanilla, "unknown"}} {
		_, err := RegistryForFlavor(nil, f).PrepareGraph(database.LogFormat112aCcAddon, nil, nil, nil)
		require.Error(t, err)
	}
	r := RegistryForFlavor(nil, flavor)
	r.SetFallback(NewRegistry(nil, flavor))
	_, err := r.PrepareGraph(database.LogFormat112aCcAddon, nil, nil, nil)
	require.Error(t, err)
	r = RegistryForFlavor(nil, flavor)
	r.RegisterEntry(Entry{Name: "opaque", Factory: func(_ctx context.Context, _logger *slog.Logger, _db *unitdb.Units, _z zone.Zone, _flavor database.WoWFlavor) *instances.Hookable {
		panic("opaque factory must not execute")
	}})
	_, err = r.PrepareGraph(database.LogFormat112aCcAddon, nil, nil, nil)
	require.ErrorContains(t, err, "opaque")
	r = NewRegistry(nil, flavor)
	r.RegisterEntry(FromCommonFactory(&instances.CommonFactory{Name: "unannotated"}))
	_, err = r.PrepareGraph(database.LogFormat112aCcAddon, nil, nil, nil)
	require.Error(t, err)
}

func TestPreparedGraphProductionCaptureRestore(t *testing.T) {
	t.Parallel()
	flavor := database.ServerFlavor("turtle", database.FlavorVanilla)
	for _, format := range []database.LogFormat{database.LogFormat112aCcAddon, database.LogFormat112aSuperwowAddon} {
		for _, fixture := range []struct {
			name  string
			mapID uint32
			entry uint32
		}{
			{"Naxxramas", 533, 15990}, {"Blackwing Lair", 469, 11583}, {"Molten Core", 409, 11502}, {"Deadmines", 36, 644}, {"Temple of Ahn'Qiraj", 531, 15727},
		} {
			t.Run(string(format)+"/"+fixture.name, func(t *testing.T) {
				t.Parallel()
				modifiers, catalog := &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}
				prepare := func() *PreparedGraph {
					p, err := RegistryForFlavor(slog.Default(), flavor).PrepareGraph(format, modifiers, catalog, nil)
					require.NoError(t, err)
					return p
				}
				p := prepare()
				ctx := parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: flavor})
				state, err := p.NewEncounterState(ctx, slog.Default())
				require.NoError(t, err)
				at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
				require.NoError(t, state.Zone(messages.Zone{MessageBase: messages.Base(at), Zone: zone.Zone{Name: fixture.name, MapID: fixture.mapID, IsInstance: true, Seen: at}}))
				require.NotNil(t, state.CurrentInstance)
				player := guid.GUID(1)
				require.NoError(t, state.Process(&messages.Damage{MessageBase: messages.Base(at.Add(time.Second)), Caster: &player, Target: guid.GUID(0xF130000000000001 | uint64(fixture.entry)<<24), Amount: 100}))
				require.True(t, state.CurrentInstance.FightActive(), "fixture must exercise active encounter owners")
				reg := ownergraph.NewRegistry()
				require.NoError(t, p.RegisterOwners(reg, graphCompatibility(format, flavor), state))
				saved, err := reg.Capture(state)
				require.NoError(t, err)
				data, err := json.Marshal(saved)
				require.NoError(t, err)
				var disk ownergraph.Snapshot
				require.NoError(t, json.Unmarshal(data, &disk))
				fresh := prepare()
				restore := ownergraph.NewRegistry()
				require.NoError(t, fresh.RegisterOwners(restore, graphCompatibility(format, flavor), nil))
				// Neither semantic restoration nor runtime rewiring may replay constructors.
				for i := range fresh.factories.Factories {
					fresh.factories.Factories[i] = func(guid.GUID, *characters.Characters) (characters.Character, bool) {
						panic("factory executed during restore")
					}
				}
				restored, err := restore.Restore(disk)
				require.NoError(t, err)
				next := restored.(*encounters.State)
				require.Equal(t, state.CurrentInstance.Name(), next.CurrentInstance.Name())
				require.Zero(t, next.Auras.GraphObserverCount())
				require.NoError(t, next.WireGraphRuntime(ctx, slog.Default()))
				recapture := ownergraph.NewRegistry()
				require.NoError(t, fresh.RegisterOwners(recapture, graphCompatibility(format, flavor), next))
				again, err := recapture.Capture(next)
				require.NoError(t, err)
				encoded, err := json.Marshal(again)
				require.NoError(t, err)
				require.JSONEq(t, string(data), string(encoded))
			})
		}
	}
}

// Registry iteration historically had no overlap priority. Compare the entire
// matching set rather than selecting one arbitrary winner from the old map.
func TestPreparedGraphPreservesZoneMatching(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{database.ServerFlavor("turtle", database.FlavorVanilla), database.ServerFlavor("vanillaplus", database.FlavorVanilla), database.ServerFlavor("wow-forever", database.FlavorVanilla)} {
		registry := RegistryForFlavor(slog.Default(), flavor)
		p, err := registry.PrepareGraph(database.LogFormat112aCcAddon, nil, nil, nil)
		require.NoError(t, err)
		hooks := map[string]*instances.HookableGraphRecipe{}
		for _, h := range p.hooks {
			hooks[h.ID] = h
		}
		probes := []zone.Zone{{Name: "unknown"}, {Name: "Scarlet Monastery"}, {Name: "血色修道院"}, {MapID: 189}, {Name: "木喉要塞", IsInstance: false, InstanceType: "none"}, {Name: "木喉要塞", IsInstance: true, InstanceType: "raid"}}
		for _, entry := range registry.entries {
			f := entry.commonFactory
			for _, name := range f.ZoneNames {
				for _, kind := range []string{"", "raid", "party", "none"} {
					probes = append(probes, zone.Zone{Name: name, InstanceType: kind, IsInstance: kind != "none"})
				}
			}
			for _, id := range f.MapIDs {
				probes = append(probes, zone.Zone{MapID: id, IsInstance: true})
			}
		}
		for _, entry := range registry.entries {
			f := entry.commonFactory
			for _, probe := range probes {
				require.Equal(t, f.MatchZone(probe), hooks[f.GraphID].MatchesZone(probe), "%s %s %#v", flavor.CanonicalKey(), entry.Name, probe)
			}
		}
	}
}
