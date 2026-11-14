package statecatalog_test

import (
	"encoding/json"
	"go/types"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/statecatalog"
	"github.com/stretchr/testify/require"
	"golang.org/x/tools/go/packages"
)

func TestCharacterTypeCatalogCoversImplementations(t *testing.T) {
	t.Parallel()

	graph, err := statecatalog.Target()
	require.NoError(t, err)

	catalogTypes := make(map[string]struct{})
	for _, node := range graph.Nodes {
		var metadata struct {
			Classification string `json:"classification"`
			GoType         string `json:"go_type"`
		}
		if err := json.Unmarshal(node.Metadata, &metadata); err != nil || metadata.Classification != "character_type" {
			continue
		}
		catalogTypes[metadata.GoType] = struct{}{}
	}

	const commonPackage = "github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	patterns := []string{
		commonPackage,
		"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures",
		"github.com/Emyrk/chronicle/combatlog/parser/wotlk/creatures",
	}
	packages, err := packages.Load(&packages.Config{Mode: packages.NeedName | packages.NeedTypes | packages.NeedDeps}, patterns...)
	require.NoError(t, err)

	for _, pkg := range packages {
		require.Empty(t, pkg.Errors, "load package %s: %v", pkg.PkgPath, pkg.Errors)
	}

	var character *types.Interface
	for _, pkg := range packages {
		if pkg.PkgPath == commonPackage {
			character = pkg.Types.Scope().Lookup("Character").Type().Underlying().(*types.Interface).Complete()
			break
		}
	}
	require.NotNil(t, character)

	for _, pkg := range packages {
		for _, name := range pkg.Types.Scope().Names() {
			typeName, ok := pkg.Types.Scope().Lookup(name).(*types.TypeName)
			if !ok {
				continue
			}
			named, ok := typeName.Type().(*types.Named)
			if !ok {
				continue
			}
			if _, ok := named.Underlying().(*types.Struct); !ok {
				continue
			}
			if !types.Implements(named, character) && !types.Implements(types.NewPointer(named), character) {
				continue
			}
			typeID := pkg.PkgPath + "." + name
			require.Contains(t, catalogTypes, typeID, "catalog concrete Character type %s", typeID)
		}
	}
}
