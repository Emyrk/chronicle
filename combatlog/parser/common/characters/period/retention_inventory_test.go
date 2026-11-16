package period

import (
	"bytes"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// This guards the reviewed syntax inventory, not dynamic interface reachability.
// New sites or changed arguments require reviewing RETENTION.md and codec tests.
func TestCharacterRetentionSiteInventory(t *testing.T) {
	t.Parallel()
	root := filepath.Clean("../../..") // combatlog/parser
	var inventory []string
	names := map[string]bool{"Begin": true, "Start": true, "End": true, "Bump": true, "Died": true, "Touch": true, "EnterResetGracePeriod": true, "MarkActivityStart": true, "MarkActivityBump": true, "MarkAdd": true}
	for _, dir := range []string{"common/characters", "vanilla/creatures", "wotlk/creatures", "wotlk/instances"} {
		err := filepath.WalkDir(filepath.Join(root, dir), func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			set := token.NewFileSet()
			file, err := parser.ParseFile(set, path, nil, 0)
			if err != nil {
				return err
			}
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}
			text := func(n ast.Node) string {
				var b bytes.Buffer
				require.NoError(t, format.Node(&b, set, n))
				return strings.Join(strings.Fields(b.String()), " ")
			}
			for _, decl := range file.Decls {
				fn, ok := decl.(*ast.FuncDecl)
				if !ok || fn.Body == nil {
					continue
				}
				owner := fn.Name.Name
				if fn.Recv != nil {
					owner = text(fn.Recv.List[0].Type) + "." + owner
				}
				ast.Inspect(fn.Body, func(n ast.Node) bool {
					retain := false
					switch n := n.(type) {
					case *ast.CallExpr:
						if sel, ok := n.Fun.(*ast.SelectorExpr); ok {
							retain = names[sel.Sel.Name]
							if dir == "wotlk/instances" {
								retain = strings.HasPrefix(sel.Sel.Name, "MarkActivity") || sel.Sel.Name == "MarkAdd"
							}
						}
					case *ast.CompositeLit:
						switch typ := n.Type.(type) {
						case *ast.Ident:
							retain = typ.Name == "Moment"
						case *ast.SelectorExpr:
							retain = typ.Sel.Name == "Moment"
						}
					case *ast.AssignStmt:
						for _, lhs := range n.Lhs {
							if sel, ok := lhs.(*ast.SelectorExpr); ok {
								switch sel.Sel.Name {
								case "LastActive", "ResetMessage", "LastSlain", "pendingDeath":
									retain = true
								}
							}
						}
					}
					if retain {
						inventory = append(inventory, filepath.ToSlash(rel)+" | "+owner+" | "+text(n))
					}
					return true
				})
			}
			return nil
		})
		require.NoError(t, err)
	}
	sort.Strings(inventory)
	actual := strings.Join(inventory, "\n") + "\n"
	expected, err := os.ReadFile("testdata/retention_sites.txt")
	require.NoError(t, err)
	require.Equal(t, string(expected), actual, "review new/changed retention sites and update the bounded contract")
}
