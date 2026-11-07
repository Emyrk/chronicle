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
		"/root/encounters":             statecatalog.TypeEncounterState,
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
		"/root/encounters/current-instance":    "/root/instances/0000",
		"/root/encounters/instances/0000":      "/root/instances/0000",
		"/root/encounters/units":               "/root/shared/units",
		"/root/encounters/vehicles":            "/root/shared/vehicles",
		"/root/encounters/raid-groups":         "/root/shared/raid-groups",
		"/root/encounters/auras":               "/root/shared/auras",
		"/root/encounters/consume-tracker":     "/root/shared/consume-tracker",
		"/root/instances/0000/units":           "/root/shared/units",
		"/root/instances/0000/vehicles":        "/root/shared/vehicles",
		"/root/instances/0000/raid-groups":     "/root/shared/raid-groups",
		"/root/instances/0000/auras":           "/root/shared/auras",
		"/root/instances/0000/consume-tracker": "/root/shared/consume-tracker",
	} {
		require.Equal(t, stategraph.KindReference, nodes[reference].Kind, reference)
		require.Equal(t, target, nodes[reference].Target, reference)
	}

	require.Len(t, graph.DependenciesFrom("/root/encounters"), 5)
	require.Len(t, graph.DependenciesFrom("/root/instances/0000"), 5)
	require.Len(t, graph.ReferencesTo("/root/shared/units"), 2)
	require.NotEmpty(t, graph.Children("/root/encounters"))

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
