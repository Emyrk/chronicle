package chronicle

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestValidateParsedJobVersion(t *testing.T) {
	t.Parallel()
	current := version.ExactParserVersion()
	require.NoError(t, ValidateParsedJobVersion(ParsedJobExecutorHeadless, current))
	require.ErrorContains(t, ValidateParsedJobVersion(ParsedJobExecutorHeadless, ""), "does not match")
	require.ErrorContains(t, ValidateParsedJobVersion(ParsedJobExecutorHeadless, current+"-other"), "does not match")
	require.NoError(t, ValidateParsedJobVersion(ParsedJobExecutorFull, current+"-other"))
	require.NoError(t, ValidateParsedJobVersion(ParsedJobExecutorFull, ""))
	require.ErrorContains(t, ValidateParsedJobVersion("", current), "unknown parsed job executor")
	require.ErrorContains(t, ValidateParsedJobVersion("other", current), "unknown parsed job executor")
}

func TestValidateParsedResultProvenance(t *testing.T) {
	t.Parallel()
	format := database.LogFormat112aCcAddon
	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle}
	dataset := uuid.New()
	valid := parseresult.Result{SchemaVersion: parseresult.SchemaVersion, Format: format, Flavor: database.WoWFlavor{database.FlavorTurtle, database.FlavorVanilla}, DatasetID: dataset, ParserVersion: version.ExactParserVersion()}
	wire, err := json.Marshal(valid)
	require.NoError(t, err)
	var decoded parseresult.Result
	require.NoError(t, json.Unmarshal(wire, &decoded))
	require.NoError(t, ValidateParsedResultProvenance(decoded, format, flavor, dataset))

	for _, tc := range []struct {
		name    string
		payload parseresult.Result
		format  database.LogFormat
		flavor  database.WoWFlavor
		dataset uuid.UUID
	}{
		{"missing schema", parseresult.Result{SchemaVersion: 0, Format: format, Flavor: flavor, DatasetID: dataset, ParserVersion: valid.ParserVersion}, format, flavor, dataset},
		{"wrong format", valid, database.LogFormat243CcAddon, flavor, dataset},
		{"unsupported format", parseresult.Result{SchemaVersion: parseresult.SchemaVersion, Format: database.LogFormat("unknown"), Flavor: flavor, DatasetID: dataset, ParserVersion: valid.ParserVersion}, format, flavor, dataset},
		{"missing version", parseresult.Result{SchemaVersion: parseresult.SchemaVersion, Format: format, Flavor: flavor, DatasetID: dataset}, format, flavor, dataset},
		{"missing dataset", parseresult.Result{SchemaVersion: parseresult.SchemaVersion, Format: format, Flavor: flavor, ParserVersion: valid.ParserVersion}, format, flavor, dataset},
		{"unresolved dataset", valid, format, flavor, uuid.Nil},
		{"wrong dataset", valid, format, flavor, uuid.New()},
		{"missing flavor", parseresult.Result{SchemaVersion: parseresult.SchemaVersion, Format: format, DatasetID: dataset, ParserVersion: valid.ParserVersion}, format, flavor, dataset},
		{"unresolved flavor", valid, format, nil, dataset},
		{"wrong flavor", valid, format, database.WoWFlavor{database.FlavorVanilla}, dataset},
		{"duplicate flavor", parseresult.Result{SchemaVersion: parseresult.SchemaVersion, Format: format, Flavor: database.WoWFlavor{database.FlavorVanilla, database.FlavorVanilla}, DatasetID: dataset, ParserVersion: valid.ParserVersion}, format, flavor, dataset},
		{"empty tag", parseresult.Result{SchemaVersion: parseresult.SchemaVersion, Format: format, Flavor: database.WoWFlavor{database.FlavorVanilla, ""}, DatasetID: dataset, ParserVersion: valid.ParserVersion}, format, flavor, dataset},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.Error(t, ValidateParsedResultProvenance(tc.payload, tc.format, tc.flavor, tc.dataset))
		})
	}
	otherBuild := valid
	otherBuild.ParserVersion += "-other"
	require.NoError(t, ValidateParsedResultProvenance(otherBuild, format, flavor, dataset))
	empty := parseresult.Result{SchemaVersion: parseresult.SchemaVersion, Format: format, Flavor: database.WoWFlavor{}, DatasetID: dataset, ParserVersion: valid.ParserVersion}
	require.NoError(t, ValidateParsedResultProvenance(empty, format, database.WoWFlavor{}, dataset))
}
