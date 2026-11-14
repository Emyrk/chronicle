package registry

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestPreparedExpansionConstructorParity(t *testing.T) {
	t.Parallel()
	for _, format := range []database.LogFormat{database.LogFormat243CcAddon, database.LogFormat335aCcAddon, database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc} {
		for _, flavor := range []database.WoWFlavor{database.ServerFlavor("azerothcore", database.FlavorWrath), database.ServerFlavor("epoch", database.FlavorWrath), {database.FlavorTBC}, {database.FlavorWrath}, {database.FlavorWrath, database.FlavorAzerothcoreProgression}, {database.FlavorWrath, database.FlavorChromieCraft}} {
			if format == database.LogFormat243CcAddon && !flavor.Has(database.FlavorTBC) || format == database.LogFormat335aCcAddon && !flavor.Has(database.FlavorWrath) {
				continue
			}
			t.Run(string(format)+"/"+flavor.CanonicalKey(), func(t *testing.T) {
				t.Parallel()
				reg := RegistryForFlavor(slog.Default(), flavor)
				p, err := reg.PrepareGraph(format, &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, nil)
				require.NoError(t, err)
				require.NoError(t, p.RegisterOwners(ownergraph.NewRegistry(), graphCompatibility(format, flavor), nil))
				ctx := parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: flavor})
				for name, entry := range reg.entries {
					f, err := entry.commonFactory.PrepareGraph(format, flavor, p.factories)
					require.NoError(t, err, name)
					for _, z := range []zone.Zone{{Name: name, IsInstance: true, InstanceType: "raid"}, {Name: name, IsInstance: true, InstanceType: "raid", MaxPlayers: 25, DifficultyName: "25 Player"}} {
						legacy := entry.commonFactory.New(ctx, slog.Default(), unitdb.New(), z, flavor)
						prepared, err := f.New(ctx, slog.Default(), unitdb.New(), z)
						require.NoError(t, err, name)
						require.Equal(t, legacy.Name(), prepared.Name(), name)
						require.Equal(t, legacy.Category, prepared.Category, name)
						require.Equal(t, legacy.CurrentZone, prepared.CurrentZone, name)
						legacyRules, preparedRules := legacy.HostileEntries(), prepared.HostileEntries()
						require.Len(t, preparedRules, len(legacyRules), name)
						for entry, expected := range legacyRules {
							actual, ok := preparedRules[entry]
							require.True(t, ok)
							require.Equal(t, expected.EncounterNameFn == nil, actual.EncounterNameFn == nil)
							expected.EncounterNameFn, actual.EncounterNameFn = nil, nil
							require.Equal(t, expected, actual, name)
						}
					}
				}
			})
		}
	}
}

func TestPreparedExpansionActiveDiskRoundtrip(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name         string
		mapID, entry uint32
		flavor       database.WoWFlavor
		format       database.LogFormat
	}{
		{"Karazhan", 532, 16179, database.WoWFlavor{database.FlavorTBC}, database.LogFormat243CcAddon},
		{"Onyxia's Lair", 249, 45136, database.ServerFlavor("epoch", database.FlavorWrath), database.LogFormat335aCcAddon},
		{"Icecrown Citadel", 631, 36612, database.ServerFlavor("azerothcore", database.FlavorWrath), database.LogFormat335aCcAddon},
		{"Tempest Keep", 550, 20064, database.WoWFlavor{database.FlavorTBC}, database.LogFormatV9Cleu},
		{"Black Temple", 564, 23418, database.WoWFlavor{database.FlavorTBC}, database.LogFormat243CcAddon},
		{"Obsidian Sanctum", 615, 28860, database.WoWFlavor{database.FlavorWrath}, database.LogFormat335aCcAddon},
		{"Eye of Eternity", 616, 28859, database.WoWFlavor{database.FlavorWrath}, database.LogFormatV22Cleu},
		{"Ulduar", 603, 32845, database.WoWFlavor{database.FlavorWrath}, database.LogFormat335aCcAddon},
		{"Icecrown Citadel", 631, 36612, database.WoWFlavor{database.FlavorWrath}, database.LogFormat335aCcAddon},
		{"Onyxia's Lair", 249, 301000, database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcoreProgression}, database.LogFormat335aCcAddon},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			prepare := func() *PreparedGraph {
				p, err := RegistryForFlavor(slog.Default(), tc.flavor).PrepareGraph(tc.format, &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, nil)
				require.NoError(t, err)
				return p
			}
			p := prepare()
			ctx := parsectx.With(t.Context(), parsectx.Context{Format: tc.format, Flavor: tc.flavor})
			state, err := p.NewEncounterState(ctx, slog.Default())
			require.NoError(t, err)
			at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
			require.NoError(t, state.Zone(messages.Zone{MessageBase: messages.Base(at), Zone: zone.Zone{Name: tc.name, MapID: tc.mapID, IsInstance: true, InstanceType: "raid", Seen: at}}))
			player := guid.GUID(1)
			target := guid.GUID(0xF130000000000001 | uint64(tc.entry)<<24)
			hit := func(at time.Time) *messages.Damage {
				return &messages.Damage{MessageBase: messages.Base(at), Caster: &player, Target: target, Amount: 100}
			}
			require.NoError(t, state.Process(hit(at.Add(time.Second))))
			require.True(t, state.CurrentInstance.FightActive())
			if tc.entry == 301000 {
				require.Equal(t, "Onyxia Classic", state.CurrentInstance.Name())
			}
			r := ownergraph.NewRegistry()
			require.NoError(t, p.RegisterOwners(r, graphCompatibility(tc.format, tc.flavor), state))
			graph, err := r.Capture(state)
			require.NoError(t, err)
			b, err := json.Marshal(graph)
			require.NoError(t, err)
			path := filepath.Join(t.TempDir(), "expansion.json")
			require.NoError(t, os.WriteFile(path, b, 0600))
			b, err = os.ReadFile(path)
			require.NoError(t, err)
			var disk ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(b, &disk))
			fresh := prepare()
			rr := ownergraph.NewRegistry()
			require.NoError(t, fresh.RegisterOwners(rr, graphCompatibility(tc.format, tc.flavor), nil))
			unknown := strings.ReplaceAll(string(b), "wotlk/instances/", "unknown/instances/")
			require.NotEqual(t, string(b), unknown)
			var unsupported ownergraph.Snapshot
			require.NoError(t, json.Unmarshal([]byte(unknown), &unsupported))
			_, err = rr.Restore(unsupported)
			require.Error(t, err, "unknown archive recipe must not enable a factory")

			originalFactories := append([]characters.CharacterFactory(nil), fresh.factories.Factories...)
			for i := range fresh.factories.Factories {
				fresh.factories.Factories[i] = func(guid.GUID, *characters.Characters) (characters.Character, bool) { panic("gameplay factory replay") }
			}
			v, err := rr.Restore(disk)
			require.NoError(t, err)
			restored := v.(*encounters.State)
			require.NoError(t, restored.WireGraphRuntime(ctx, slog.Default()))
			copy(fresh.factories.Factories, originalFactories)
			require.NoError(t, state.Process(hit(at.Add(2*time.Second))))
			require.NoError(t, restored.Process(hit(at.Add(2*time.Second))))
			expected, err := r.Capture(state)
			require.NoError(t, err)
			recapture := ownergraph.NewRegistry()
			require.NoError(t, fresh.RegisterOwners(recapture, graphCompatibility(tc.format, tc.flavor), restored))
			actual, err := recapture.Capture(restored)
			require.NoError(t, err)
			require.Equal(t, expected, actual)
		})
	}
}

func TestPreparedGraphACoreRequiresTypedAdapter(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorWrath}} {
		_, err := RegistryForFlavor(slog.Default(), flavor).PrepareGraph(database.LogFormatAzerothcoreMod, nil, nil, nil)
		require.ErrorContains(t, err, "unsupported graph log format")
	}
}
