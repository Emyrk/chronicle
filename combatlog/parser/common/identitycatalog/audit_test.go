package identitycatalog

import (
	"github.com/stretchr/testify/require"
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

// Every message type must be explicitly audited even when it carries no GUID.
// A new message fails here until Process names it and audits all its GUID roles.
func TestMessageTypeAudit(t *testing.T) {
	t.Parallel()
	f, err := parser.ParseFile(token.NewFileSet(), "../messages/message.go", nil, 0)
	require.NoError(t, err)
	expected := map[string]bool{}
	for _, d := range f.Decls {
		fn, ok := d.(*ast.FuncDecl)
		if !ok || fn.Name.Name != "isMessage" {
			continue
		}
		star, ok := fn.Recv.List[0].Type.(*ast.StarExpr)
		require.True(t, ok)
		expected[star.X.(*ast.Ident).Name] = true
	}
	p, err := parser.ParseFile(token.NewFileSet(), "process.go", nil, 0)
	require.NoError(t, err)
	actual := map[string]bool{}
	ast.Inspect(p, func(n ast.Node) bool {
		cl, ok := n.(*ast.CaseClause)
		if !ok {
			return true
		}
		for _, x := range cl.List {
			star, ok := x.(*ast.StarExpr)
			if !ok {
				continue
			}
			sel, ok := star.X.(*ast.SelectorExpr)
			if ok {
				actual[sel.Sel.Name] = true
			}
		}
		return true
	})
	require.Equal(t, expected, actual, "explicitly audit new message GUID fields, do not rely on Affects")
}
