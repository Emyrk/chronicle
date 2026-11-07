package statecatalog_test

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/statecatalog"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/stretchr/testify/require"
)

var update = flag.Bool("update", false, "regenerate the target state catalog")

func TestTargetCatalog(t *testing.T) {
	t.Parallel()

	graph, err := statecatalog.Target()
	require.NoError(t, err)

	require.Equal(t, stategraph.FormatVersion, graph.Version)

	nodes := make(map[stategraph.Path]stategraph.Node, len(graph.Nodes))
	for _, node := range graph.Nodes {
		nodes[node.Path] = node
	}

	for path, typ := range map[stategraph.Path]string{
		"/root/parse-state":            statecatalog.TypeEncounterState,
		"/root/instances/0000":         statecatalog.TypeHookable,
		"/root/shared/units":           statecatalog.TypeUnits,
		"/root/shared/vehicles":        statecatalog.TypeVehicles,
		"/root/shared/raid-groups":     statecatalog.TypeRaidGroups,
		"/root/shared/auras":           statecatalog.TypeAuras,
		"/root/shared/consume-tracker": statecatalog.TypeConsumes,
	} {
		require.Equal(t, stategraph.KindValue, nodes[path].Kind, path)
		require.Equal(t, typ, nodes[path].Type, path)
	}

	for reference, target := range map[stategraph.Path]stategraph.Path{
		"/root/parse-state/current-instance":   "/root/instances/0000",
		"/root/parse-state/instances/0000":     "/root/instances/0000",
		"/root/parse-state/units":              "/root/shared/units",
		"/root/parse-state/vehicles":           "/root/shared/vehicles",
		"/root/parse-state/raid-groups":        "/root/shared/raid-groups",
		"/root/parse-state/auras":              "/root/shared/auras",
		"/root/parse-state/consume-tracker":    "/root/shared/consume-tracker",
		"/root/instances/0000/units":           "/root/shared/units",
		"/root/instances/0000/vehicles":        "/root/shared/vehicles",
		"/root/instances/0000/raid-groups":     "/root/shared/raid-groups",
		"/root/instances/0000/auras":           "/root/shared/auras",
		"/root/instances/0000/consume-tracker": "/root/shared/consume-tracker",
	} {
		require.Equal(t, stategraph.KindReference, nodes[reference].Kind, reference)
		require.Equal(t, target, nodes[reference].Target, reference)
	}

	require.Len(t, graph.DependenciesFrom("/root/parse-state"), 5)
	require.Len(t, graph.DependenciesFrom("/root/instances/0000"), 6)
	require.Len(t, graph.ReferencesTo("/root/shared/units"), 3)
	require.NotEmpty(t, graph.Children("/root/parse-state"))

	characters, ok := graph.Find("/root/instances/0000/characters")
	require.True(t, ok)
	require.Equal(t, statecatalog.TypeCharacters, characters.Type)
	require.Len(t, graph.DependenciesFrom(characters.Path), 4)

	for _, path := range []stategraph.Path{
		"/root/character-types/common/common",
		"/root/character-types/vanilla/totem",
		"/root/character-types/vanilla/nefarian",
		"/root/character-types/wotlk/mimiron",
		"/root/character-types/wotlk/thorim",
		"/root/character-shared-state/common/room",
		"/root/character-shared-state/wotlk/yogg-saron",
	} {
		node, ok := graph.Find(path)
		require.True(t, ok, path)
		require.Equal(t, stategraph.KindDirectory, node.Kind, path)
	}

	require.NotEmpty(t, graph.DependenciesFrom("/root/character-types/wotlk/mimiron"))
	require.NotEmpty(t, graph.DependenciesFrom("/root/instances/0000/characters/shared-state"))

	encoded, err := json.MarshalIndent(graph, "", "  ")
	require.NoError(t, err)
	encoded = append(encoded, '\n')

	path := filepath.Join("..", "..", "..", "..", "docs", "logparse-snapshots", "catalog", "target.json")
	if *update {
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o750))
		require.NoError(t, os.WriteFile(path, encoded, 0o600))
		return
	}

	want, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, string(want), string(encoded), "run go test ./combatlog/parser/common/statecatalog -run TestTargetCatalog -update")
}
