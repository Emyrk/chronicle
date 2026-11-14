package encounters

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	common "github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func acoreCompatibility(flavor database.WoWFlavor) snapshot.Compatibility {
	return snapshot.Compatibility{DatasetID: "00000000-0000-0000-0000-000000000005", DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: string(database.LogFormatAzerothcoreMod), Flavor: flavor.CanonicalKey()}
}

func TestPreparedACoreProductionDiskRoundtrip(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{database.ServerFlavor("azerothcore", database.FlavorWrath), {database.FlavorVanilla, database.FlavorOctoWoW}, {database.FlavorWrath, database.FlavorChromieCraft}} {
		for _, known := range []bool{false, true} {
			name := "unknown"
			if known {
				name = "known"
			}
			t.Run(flavor.CanonicalKey()+"/"+name, func(t *testing.T) {
				t.Parallel()
				logger := slog.Default()
				reg := registry.RegistryForFlavor(logger, flavor)
				hookCalls := 0
				prepare := func() *registry.PreparedGraph {
					hook := AzerothCoreHookGraphRecipe()
					original := hook.New
					hook.New = func(id *identifier.Identifier) instancehook.Hook { hookCalls++; return original(id) }
					p, err := reg.PrepareAzerothCoreGraph(&chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, nil, registry.AzerothCoreGraphAdapter{Hook: hook, RegisterHook: RegisterAzerothCoreHookGraphOwner})
					require.NoError(t, err)
					return p
				}
				p := prepare()
				ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormatAzerothcoreMod, Flavor: flavor})
				state, err := p.NewEncounterState(ctx, logger)
				require.NoError(t, err)
				legacy := New(ctx, logger, reg)
				at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
				z := zone.Zone{Name: "Unregistered Instance", MapID: 999999, InstanceID: 456, IsInstance: true, InstanceType: "raid", Seen: at}
				entry := uint32(90000)
				if known {
					z.Name = "Molten Core"
					z.MapID = 409
					entry = 11502
				}
				if known && flavor.Has(database.FlavorWrath) {
					z.Name = "Icecrown Citadel"
					z.MapID = 631
					entry = 36612
				}
				for _, s := range []*common.State{state, legacy} {
					require.NoError(t, s.Zone(messages.Zone{MessageBase: messages.Base(at), Zone: z}))
				}
				require.Equal(t, legacy.CurrentInstance.Name(), state.CurrentInstance.Name())
				require.Equal(t, legacy.CurrentInstance.Category, state.CurrentInstance.Category)
				require.Equal(t, legacy.CurrentInstance.CurrentZone, state.CurrentInstance.CurrentZone)
				for _, probe := range []zone.Zone{z, {Name: "changed", InstanceID: z.InstanceID, MapID: z.MapID}, {Name: z.Name, MapID: z.MapID, InstanceID: z.InstanceID + 1}, {Name: "other", MapID: 999998, InstanceID: 999}} {
					require.Equal(t, legacy.CurrentInstance.MatchesZone(probe), state.CurrentInstance.MatchesZone(probe))
				}
				player := guid.GUID(1)
				target := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
				prefix := func(s *common.State) {
					require.NoError(t, s.Process(classificationUnit(entry, "server boss", true)))
					require.NoError(t, s.Process(&messages.UnitCombatEnter{MessageBase: messages.Base(at.Add(time.Second)), UnitGUID: target}))
					require.NoError(t, s.Process(&messages.Damage{MessageBase: messages.Base(at.Add(2 * time.Second)), Caster: &player, Target: target, Amount: 100}))
					require.True(t, s.CurrentInstance.FightActive())
					require.NoError(t, s.Process(&messages.UnitEvade{MessageBase: messages.Base(at.Add(3 * time.Second)), UnitGUID: target, UnitName: "server boss", Reason: 2}))
					require.NotEmpty(t, s.CurrentInstance.Fights(), "completed history must be retained")
					require.NoError(t, s.Process(&messages.UnitCombatEnter{MessageBase: messages.Base(at.Add(4 * time.Second)), UnitGUID: target}))
					require.NoError(t, s.Process(&messages.Damage{MessageBase: messages.Base(at.Add(5 * time.Second)), Caster: &player, Target: target, Amount: 100}))
					require.True(t, s.CurrentInstance.FightActive())
				}
				prefix(state)
				require.Equal(t, "server boss", state.CurrentInstance.HostileEntries()[entry].Name)
				capture := func(p *registry.PreparedGraph, s *common.State) ownergraph.Snapshot {
					r := ownergraph.NewRegistry()
					require.NoError(t, p.RegisterOwners(r, acoreCompatibility(flavor), s))
					graph, err := r.Capture(s)
					require.NoError(t, err)
					return graph
				}
				saved := capture(p, state)
				b, err := json.Marshal(saved)
				require.NoError(t, err)
				path := filepath.Join(t.TempDir(), "acore.json")
				require.NoError(t, os.WriteFile(path, b, 0600))
				b, err = os.ReadFile(path)
				require.NoError(t, err)
				var disk ownergraph.Snapshot
				require.NoError(t, json.Unmarshal(b, &disk))
				fresh := prepare()
				rr := ownergraph.NewRegistry()
				require.NoError(t, fresh.RegisterOwners(rr, acoreCompatibility(flavor), nil))
				before := hookCalls
				v, err := rr.Restore(disk)
				require.NoError(t, err)
				next := v.(*common.State)
				require.Equal(t, before, hookCalls, "semantic restore must not run hook constructors")
				require.NoError(t, next.WireGraphRuntime(ctx, logger))
				require.Equal(t, before, hookCalls, "runtime wiring must not replay hook constructors")
				require.Equal(t, len(state.CurrentInstance.Fights()), len(next.CurrentInstance.Fights()))
				require.Equal(t, saved, capture(fresh, next))
				for _, s := range []*common.State{state, next} {
					unit := classificationUnit(entry, "renamed boss", true)
					unit.MessageBase = messages.Base(at.Add(6 * time.Second))
					require.NoError(t, s.Process(unit))
					require.NoError(t, s.Process(&messages.Damage{MessageBase: messages.Base(at.Add(7 * time.Second)), Caster: &player, Target: target, Amount: 250}))
					require.NoError(t, s.Process(&messages.Slain{MessageBase: messages.Base(at.Add(8 * time.Second)), Victim: target}))
				}
				require.Equal(t, capture(p, state), capture(fresh, next))
				// A distinct unknown instance must not reuse the prior fallback matcher.
				for _, s := range []*common.State{state, next} {
					nextZone := zone.Zone{Name: "Another Unregistered Instance", MapID: 999998, InstanceID: 789, IsInstance: true, Seen: at.Add(10 * time.Second)}
					require.NoError(t, s.Zone(messages.Zone{MessageBase: messages.Base(at.Add(10 * time.Second)), Zone: nextZone}))
					require.Equal(t, nextZone.Name, s.CurrentInstance.Name())
					require.True(t, s.CurrentInstance.MatchesZone(nextZone))
					require.False(t, s.CurrentInstance.MatchesZone(z))
				}
				require.Equal(t, capture(p, state), capture(fresh, next))
				for _, mutation := range []string{"tag", "null zone", "unknown zone field", "missing zone ID", "negative zone ID"} {
					var bad ownergraph.Snapshot
					require.NoError(t, json.Unmarshal(b, &bad))
					changed := false
					for i := range bad.Graph.Nodes {
						node := &bad.Graph.Nodes[i]
						if node.Kind != "value" || node.Type != "instances.hookable" {
							continue
						}
						var envelope map[string]json.RawMessage
						require.NoError(t, json.Unmarshal(node.Metadata, &envelope))
						var data map[string]json.RawMessage
						require.NoError(t, json.Unmarshal(envelope["data"], &data))
						switch mutation {
						case "tag":
							data["recipe"] = json.RawMessage(`"untrusted/fallback"`)
						case "null zone":
							data["zone"] = json.RawMessage(`null`)
						default:
							var zv map[string]json.RawMessage
							require.NoError(t, json.Unmarshal(data["zone"], &zv))
							switch mutation {
							case "unknown zone field":
								zv["matcher"] = json.RawMessage(`"arbitrary"`)
							case "missing zone ID":
								delete(zv, "InstanceID")
							case "negative zone ID":
								zv["InstanceID"] = json.RawMessage(`-1`)
							}
							data["zone"], err = json.Marshal(zv)
							require.NoError(t, err)
						}
						envelope["data"], err = json.Marshal(data)
						require.NoError(t, err)
						node.Metadata, err = json.Marshal(envelope)
						require.NoError(t, err)
						changed = true
						break
					}
					require.True(t, changed)
					_, err = rr.Restore(bad)
					require.Error(t, err, mutation)
				}
			})
		}
	}
}

func TestPreparedACoreEmptyRegistryFallback(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorVanilla}
	p, err := PrepareGraph(registry.NewRegistry(slog.Default(), flavor), &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, nil)
	require.NoError(t, err)
	ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormatAzerothcoreMod, Flavor: flavor})
	state, err := p.NewEncounterState(ctx, slog.Default())
	require.NoError(t, err)
	require.NoError(t, state.Zone(messages.Zone{Zone: zone.Zone{Name: "empty registry fallback", InstanceID: 1}}))
	require.Equal(t, "empty registry fallback", state.CurrentInstance.Name())
	require.NoError(t, p.RegisterOwners(ownergraph.NewRegistry(), acoreCompatibility(flavor), state))
}

func TestPreparedACoreAllRegisteredConstructorParity(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{database.ServerFlavor("azerothcore", database.FlavorWrath), {database.FlavorVanilla, database.FlavorOctoWoW}, {database.FlavorWrath, database.FlavorAzerothcoreProgression}} {
		t.Run(flavor.CanonicalKey(), func(t *testing.T) {
			t.Parallel()
			reg := registry.RegistryForFlavor(slog.Default(), flavor)
			p, err := PrepareGraph(reg, &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, nil)
			require.NoError(t, err)
			ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormatAzerothcoreMod, Flavor: flavor})
			for name, entry := range reg.Entries() {
				require.NotEmpty(t, entry.ZoneNames, name)
				z := zone.Zone{Name: entry.ZoneNames[0], InstanceID: 123, IsInstance: true, InstanceType: "raid"}
				expected := New(ctx, slog.Default(), reg)
				actual, err := p.NewEncounterState(ctx, slog.Default())
				require.NoError(t, err)
				require.NoError(t, expected.Zone(messages.Zone{Zone: z}))
				require.NoError(t, actual.Zone(messages.Zone{Zone: z}))
				require.NotNil(t, expected.CurrentInstance, name)
				require.NotNil(t, actual.CurrentInstance, name)
				require.Equal(t, expected.CurrentInstance.Name(), actual.CurrentInstance.Name(), name)
				require.Equal(t, expected.CurrentInstance.Category, actual.CurrentInstance.Category, name)
				require.Equal(t, expected.CurrentInstance.CurrentZone, actual.CurrentInstance.CurrentZone, name)
				expectedRules, err := expected.CurrentInstance.Finalize(ctx)
				require.NoError(t, err)
				actualRules, err := actual.CurrentInstance.Finalize(ctx)
				require.NoError(t, err)
				require.Equal(t, expectedRules.RankingRules, actualRules.RankingRules, name)
			}
		})
	}
}
