package encounters

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func classificationRecipe(calls *int) identifier.TrustedRecipe {
	return identifier.TrustedRecipe{ID: "acore-test", Factory: func() *identifier.Identifier {
		*calls++
		return identifier.NewIdentifier(map[uint32]identifier.Identity{100: {Name: "configured", EncounterName: "encounter", Boss: true, BossDeathDoesNotEndEncounter: true, EncounterNameFn: func(encounter.Fight) *identifier.EncounterFuncResult {
			return &identifier.EncounterFuncResult{EncounterName: "trusted callback"}
		}}})
	}}
}
func classificationUnit(entry uint32, name string, boss bool) *messages.Unit {
	m := &messages.Unit{MessageBase: messages.Base(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))}
	m.Guid = guid.GUID(0xF130000000000001 | uint64(entry)<<24)
	m.Name, m.Boss, m.Affiliation = name, boss, types.AffiliationHostile
	return m
}
func classificationRegistry(t *testing.T, r identifier.TrustedRecipe) *ownergraph.Registry {
	t.Helper()
	reg := ownergraph.NewRegistry()
	require.NoError(t, identifier.RegisterServerClassificationGraphOwner(reg, r))
	require.NoError(t, RegisterAzerothCoreHookGraphOwner(reg))
	return reg
}
func TestAzerothCoreDynamicGraphDiskSuffixParity(t *testing.T) {
	t.Parallel()
	calls := 0
	recipe := classificationRecipe(&calls)
	id, err := recipe.NewServerClassification()
	require.NoError(t, err)
	original := &AzerothCoreInstanceHook{ID: id}
	for _, m := range []*messages.Unit{classificationUnit(100, "server name", false), classificationUnit(200, "new mob", true)} {
		require.NoError(t, original.ProcessMessage(false, uuid.Nil, m))
	}
	unknown := classificationUnit(300, "", false).Guid
	id.IdentifyUnit(unknown)
	reg := classificationRegistry(t, recipe)
	snapshot, err := reg.Capture(original)
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "classification.json")
	require.NoError(t, os.WriteFile(path, wire, 0600))
	wire, err = os.ReadFile(path)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &disk))
	fresh := classificationRegistry(t, recipe)
	before := calls
	restored, err := fresh.Restore(disk)
	require.NoError(t, err)
	require.Equal(t, before, calls, "restore must not invoke recipe factory")
	next := restored.(*AzerothCoreInstanceHook)
	require.NotSame(t, id, next.ID)
	require.True(t, AzerothCoreHookGraphRecipe().Validate(next, next.ID))
	require.False(t, AzerothCoreHookGraphRecipe().Validate(next, id))
	require.Equal(t, id.UnknownUnits(), next.ID.UnknownUnits())
	for _, m := range []*messages.Unit{classificationUnit(100, "", false), classificationUnit(200, "renamed", false), classificationUnit(400, "new boss", true)} {
		require.NoError(t, original.ProcessMessage(true, uuid.Nil, m))
		require.NoError(t, next.ProcessMessage(true, uuid.Nil, m))
		a, b := original.ID.HostileEntries()[uint32(m.Guid>>24)&0xffffff], next.ID.HostileEntries()[uint32(m.Guid>>24)&0xffffff]
		require.Equal(t, a.Name, b.Name)
		require.Equal(t, a.Affiliation, b.Affiliation)
		require.Equal(t, a.Boss, b.Boss)
	}
	known := next.ID.HostileEntries()[100]
	require.Equal(t, "server name", known.Name)
	require.True(t, known.Boss)
	require.True(t, known.BossDeathDoesNotEndEncounter)
	require.Equal(t, "encounter", known.EncounterName)
	require.Equal(t, "trusted callback", known.EncounterNameFn(encounter.Fight{}).EncounterName)
	require.Nil(t, next.ID.HostileEntries()[200].EncounterNameFn)
	a, err := reg.Capture(original)
	require.NoError(t, err)
	b, err := fresh.Capture(next)
	require.NoError(t, err)
	aw, err := json.Marshal(a)
	require.NoError(t, err)
	bw, err := json.Marshal(b)
	require.NoError(t, err)
	require.JSONEq(t, string(aw), string(bw))
}

func TestAzerothCoreDynamicGraphRejectsInvalidBindings(t *testing.T) {
	t.Parallel()
	calls := 0
	recipe := classificationRecipe(&calls)
	id, err := recipe.NewServerClassification()
	require.NoError(t, err)
	hook := &AzerothCoreInstanceHook{ID: id}
	require.NoError(t, hook.ProcessMessage(false, uuid.Nil, classificationUnit(100, "updated", false)))
	static := ownergraph.NewRegistry()
	require.NoError(t, identifier.RegisterGraphOwner(static, recipe))
	_, err = static.Capture(id)
	require.Error(t, err)
	reg := classificationRegistry(t, recipe)
	snapshot, err := reg.Capture(hook)
	require.NoError(t, err)
	wire, err := json.Marshal(snapshot)
	require.NoError(t, err)
	for _, kind := range []string{"reference", "wrong owner", "recipe", "configuration", "new callback", "demote boss", "version"} {
		t.Run(kind, func(t *testing.T) {
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				var env map[string]json.RawMessage
				if len(n.Metadata) == 0 {
					continue
				}
				require.NoError(t, json.Unmarshal(n.Metadata, &env))
				if string(n.Path) == bad.Root {
					switch kind {
					case "reference":
						env["data"] = json.RawMessage(`"/missing"`)
					case "wrong owner":
						env["data"], err = json.Marshal(bad.Root)
					}
				} else if n.Type == "identifier.ServerClassification" {
					var data map[string]json.RawMessage
					require.NoError(t, json.Unmarshal(env["data"], &data))
					var base map[string]json.RawMessage
					require.NoError(t, json.Unmarshal(data["base"], &base))
					switch kind {
					case "recipe":
						base["recipe_id"] = json.RawMessage(`"wrong"`)
					case "configuration":
						base["configuration"] = json.RawMessage(`"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`)
					case "new callback":
						data["updates"] = json.RawMessage(`{"100":{"affiliation":3,"name":"updated","boss":true,"encounter_name_fn":"injected"}}`)
					case "demote boss":
						data["updates"] = json.RawMessage(`{"100":{"affiliation":3,"name":"updated","boss":false}}`)
					case "version":
						env["version"] = json.RawMessage(`999`)
					}
					data["base"], err = json.Marshal(base)
					require.NoError(t, err)
					env["data"], err = json.Marshal(data)
					require.NoError(t, err)
				}
				n.Metadata, err = json.Marshal(env)
				require.NoError(t, err)
			}
			_, err = reg.Restore(bad)
			require.Error(t, err)
		})
	}
	id.AddEntryId(500, identifier.Identity{Name: "untracked"})
	_, err = reg.Capture(hook)
	require.Error(t, err)
}

func TestAzerothCoreTrustedHookableComposition(t *testing.T) {
	t.Parallel()
	for _, prefix := range []bool{true, false} {
		t.Run(map[bool]string{true: "fallback-prefix", false: "registry-suffix"}[prefix], func(t *testing.T) {
			t.Parallel()
			calls := 0
			id, err := classificationRecipe(&calls).NewServerClassification()
			require.NoError(t, err)
			recipe := &instances.HookableGraphRecipe{ID: "acore-test", Format: database.LogFormatAzerothcoreMod, Factories: characters.TrustedFactoryRecipe{ID: "common"}, MatchesZone: func(zone.Zone) bool { return true }}
			if prefix {
				recipe.PrefixHooks = []instances.HookGraphRecipe{AzerothCoreHookGraphRecipe()}
			} else {
				recipe.SuffixHooks = []instances.HookGraphRecipe{AzerothCoreHookGraphRecipe()}
			}
			h, err := recipe.New(parsectx.With(t.Context(), parsectx.Context{Format: recipe.Format}), slog.Default(), unitdb.New(), zone.Zone{}, id)
			require.NoError(t, err)
			require.NoError(t, instances.ValidateHookableCharactersRuntime(h.Characters))
			require.NoError(t, h.Process(classificationUnit(200, "new mob", true)))
			require.Equal(t, "new mob", id.HostileEntries()[200].Name)
			require.True(t, id.HostileEntries()[200].Boss)
		})
	}
}
