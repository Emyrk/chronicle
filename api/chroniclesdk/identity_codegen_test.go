package chroniclesdk

import (
	"go/parser"
	"go/token"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPossibleHostilesGoCode(t *testing.T) {
	t.Parallel()
	report := &IdentityReport{Instances: []IdentityInstance{
		{Zone: "Z Raid", Units: []IdentityUnit{{EntryID: 20, Name: "Boss", Category: "ordinary", Boss: true}, {EntryID: 10, Name: "Quoted \"name\"\nline", Category: "unknown"}}},
		{Zone: "Z Raid", Units: []IdentityUnit{{EntryID: 10, Category: "ordinary"}, {EntryID: 20, Name: "Boss", Category: "ordinary"}}},
		{Zone: "1 raid", Units: []IdentityUnit{{EntryID: 3, Category: "unknown"}}},
	}}
	for i, category := range []string{"guardian", "scripted_object", "object", "environment", "critter", "totem", "trap", "demon", "player", "pet", ""} {
		report.Instances[0].Units = append(report.Instances[0].Units, IdentityUnit{EntryID: uint32(100 + i), Name: "Excluded", Category: category})
	}
	report.Instances[0].Units = append(report.Instances[0].Units, IdentityUnit{EntryID: 0, Name: "Zero", Category: "unknown"}, IdentityUnit{EntryID: 0x1000000, Name: "Invalid", Category: "ordinary"})
	code := report.GeneratePossibleHostilesGoCode()
	require.Contains(t, code, "unknown category does not prove hostility")
	require.NotContains(t, code, "Excluded")
	require.NotContains(t, code, "Zero")
	require.NotContains(t, code, "Invalid")
	require.Equal(t, 1, strings.Count(code, "10: "))
	require.Contains(t, code, "10: \"Quoted \\\"name\\\"\\nline\"")
	require.Contains(t, code, "LoadBosses(hostile, map[uint32]string{\n\t\t20: \"Boss\"")
	require.Contains(t, code, "Hostiles: FromMap(ZRaidHostiles())")
	require.Less(t, strings.Index(code, "func Zone1RaidHostiles"), strings.Index(code, "func ZRaidHostiles"))
	_, err := parser.ParseFile(token.NewFileSet(), "generated.go", "package instances\n"+code, parser.AllErrors)
	require.NoError(t, err)
	// Instance order must not affect sorting, deduplication, or retained boss role.
	report.Instances[0], report.Instances[1] = report.Instances[1], report.Instances[0]
	require.Equal(t, code, report.GeneratePossibleHostilesGoCode())
}

func TestPossibleHostilesGoCodeLegacyAndIdentifiers(t *testing.T) {
	t.Parallel()
	require.Empty(t, (*IdentityReport)(nil).GeneratePossibleHostilesGoCode())
	require.Empty(t, (&IdentityReport{ZonedUnits: map[string][]IdentityCreature{"Old": {{EntryID: 1}}}}).GeneratePossibleHostilesGoCode())
	report := &IdentityReport{}
	for _, zone := range []string{"", "!!!", "a-b", "a b", "a b2", "é raid", "zone\"\n"} {
		report.Instances = append(report.Instances, IdentityInstance{Zone: zone, Units: []IdentityUnit{{EntryID: 1, Category: "ordinary"}}})
	}
	code := report.GeneratePossibleHostilesGoCode()
	require.Contains(t, code, "UnknownZone2Hostiles")
	require.Contains(t, code, "AB2Hostiles")
	_, err := parser.ParseFile(token.NewFileSet(), "generated.go", "package instances\n"+code, parser.AllErrors|parser.DeclarationErrors)
	require.NoError(t, err)
}
