package parsernext_test

import (
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Enforce the import graph rather than relying on registration side effects.
// In particular common has no dependency path to an expansion, raid builder,
// database, River, or old parser execution; only Vanilla may reuse the exact
// legacy GUID value helper package. TBC cannot quietly delegate to WotLK.
func TestProductionDependencyDirection(t *testing.T) {
	t.Parallel()
	const prefix = "github.com/Emyrk/chronicle/combatlog/parsernext/"
	require.NoError(t, filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		owner := filepath.ToSlash(filepath.Dir(path))
		for _, spec := range file.Imports {
			imported, err := strconv.Unquote(spec.Path.Value)
			require.NoError(t, err)
			if !strings.Contains(strings.Split(imported, "/")[0], ".") {
				continue
			} // standard library
			if imported == "github.com/Emyrk/chronicle/combatlog/parser/guid" {
				require.Equal(t, "vanilla", owner, "only Vanilla's critter boundary reuses GUID helpers")
				continue
			}
			require.True(t, strings.HasPrefix(imported, prefix), "%s imports outside parsernext: %s", path, imported)
			dependency := strings.TrimPrefix(imported, prefix)
			switch owner {
			case ".":
				require.Contains(t, []string{"common", "formats", "vanilla", "tbc", "wotlk", "forever", "snapshot"}, dependency)
			case "vanilla":
				require.Contains(t, []string{"common", "formats", "common/units", "common/critters"}, dependency, "%s -> %s", owner, dependency)
			case "tbc", "wotlk", "forever":
				require.Contains(t, []string{"common", "formats"}, dependency, "%s -> %s", owner, dependency)
			case "common", "common/units", "common/critters", "formats", "formats/ccv2":
				t.Errorf("leaf package %s imports %s", owner, imported)
			case "snapshot":
				require.Contains(t, []string{"common", "vanilla", "tbc", "wotlk", "forever"}, dependency)
			default:
				t.Errorf("add an explicit dependency policy for %s", owner)
			}
		}
		return nil
	}))
}
