package parsernext_test

import (
	"go/ast"
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
// database services, River, or old parser execution; only Vanilla may reuse the exact
// listed legacy message/value packages. TBC cannot quietly delegate to WotLK.
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
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
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
			if imported == "github.com/Emyrk/chronicle/database" {
				require.Contains(t, []string{"file.go", "vanilla/profile.go", "tbc/profile.go", "wotlk/profile.go", "forever/profile.go"}, filepath.ToSlash(path))
				require.Nil(t, spec.Name, "canonical database import only, no aliases or dot imports")
				ast.Inspect(file, func(node ast.Node) bool {
					selector, ok := node.(*ast.SelectorExpr)
					if !ok {
						return true
					}
					name, ok := selector.X.(*ast.Ident)
					if ok && name.Name == "database" {
						require.Contains(t, []string{"LogFormat", "LogFormat112aCcAddon", "LogFormat243CcAddon", "LogFormat335aCcAddon", "LogFormatAzerothcoreMod", "LogFormatV22Cleu"}, selector.Sel.Name, "primitive format contract only, no database services")
					}
					return true
				})
				continue
			}
			if allowedVanillaCompatibility[imported] {
				if owner == "vanilla/synthetic" {
					// Aura correlation owns copied values, not old parser execution.
					require.Contains(t, []string{
						"github.com/Emyrk/chronicle/combatlog/parser/common/messages",
						"github.com/Emyrk/chronicle/combatlog/parser/guid",
						"github.com/Emyrk/chronicle/combatlog/parser/types",
						"github.com/Emyrk/chronicle/database/gamedb/chrondbc",
					}, imported)
				} else {
					require.Equal(t, "vanilla", owner, "only Vanilla reuses explicitly listed message/value compatibility")
				}
				continue
			}
			require.True(t, strings.HasPrefix(imported, prefix), "%s imports outside parsernext: %s", path, imported)
			dependency := strings.TrimPrefix(imported, prefix)
			switch owner {
			case ".":
				require.Contains(t, []string{"common", "vanilla", "tbc", "wotlk", "forever", "snapshot"}, dependency)
			case "vanilla":
				require.Contains(t, []string{"common", "common/units", "common/critters", "formats/ccv2"}, dependency, "%s -> %s", owner, dependency)
			case "tbc", "wotlk", "forever":
				require.Contains(t, []string{"common"}, dependency, "%s -> %s", owner, dependency)
			case "common", "common/units", "common/critters", "formats/ccv2":
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

// Temporary value/message compatibility only; never allow parser execution,
// GameDB implementations, consumers, raid builders or publication packages.
var allowedVanillaCompatibility = map[string]bool{
	"github.com/Emyrk/chronicle/internal/stategraph":              true,
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant": true,
	"github.com/Emyrk/chronicle/database/gamedb/talents":          true,
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo":  true,
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone":      true,
	"github.com/Emyrk/chronicle/combatlog/parser/unitname":        true,

	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors": true,
	"github.com/Emyrk/chronicle/combatlog/parser/types/gameversions": true,
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm":        true,
	"github.com/Masterminds/semver":                                  true,

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/spellids": true,
	"github.com/Emyrk/chronicle/combatlog/parser/guid":             true,
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages":  true,
	"github.com/Emyrk/chronicle/combatlog/parser/types":            true,
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc":          true,
	"github.com/Emyrk/chronicle/internal/ptr":                      true,
	"github.com/Emyrk/chronicle/internal/bitmask":                  true,
}
