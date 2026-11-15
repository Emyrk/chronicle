package chronicle

import (
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identitycatalog"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestIdentityCatalogueGenerationPublication(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, logID := parseGenerationFixture(t, ctx)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	chron := &Chronicle{Zed: authz.NewDatabaseOnly(logger, db), logger: logger}
	prepare := func(generation int64, id guid.GUID) *preparedCatalogue {
		collector := identitycatalog.New(nil)
		zero := guid.GUID(0)
		require.NoError(t, collector.Process(&messages.Damage{MessageBase: messages.Base(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)), Caster: &zero, Target: id, Amount: 1}))
		publication, err := prepareIdentityCatalogue(database.InsertLogIdentityCatalogueParams{LogGroupID: logID, Generation: generation, DatasetID: uuid.New(), DatasetRevision: 1, Format: "test", Flavor: "test", ParserEngine: "parsernext", ParserBuild: "test"}, collector)
		require.NoError(t, err)
		return publication
	}
	require.NoError(t, db.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: logID, ParseGeneration: 1}))
	first := prepare(1, 1)
	require.NoError(t, chron.finalizeParseGeneration(ctx, logID, 1, nil, first))
	header, err := db.GetLogIdentityCatalogue(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, int64(1), header.Generation)
	require.Equal(t, int64(2), header.GuidCount)
	require.Equal(t, int64(1), header.ZeroGuidCount)
	require.Equal(t, int64(1), header.EventCount)
	rows, err := db.DownloadLogIdentityCatalogueRecords(ctx, logID)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	generation, err := advanceGenerationTx(ctx, db, logID, false)
	require.NoError(t, err)
	require.Equal(t, int64(2), generation)
	// Stale work cannot delete the previous successful catalogue.
	require.ErrorIs(t, chron.finalizeParseGeneration(ctx, logID, 1, nil, first), errStaleParseGeneration)
	old, err := db.GetLogIdentityCatalogue(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, header, old)
	require.NoError(t, db.DeleteAllParsedLogsByGroupID(ctx, logID))
	require.NoError(t, db.InsertStagedParsedLogGroup(ctx, database.InsertStagedParsedLogGroupParams{ID: logID, ParseGeneration: 2}))
	second := prepare(2, 2)
	// A duplicate row fails after deleting/reinserting the header; the transaction
	// must restore every old row and leave successful publication untouched.
	second.Records = append(second.Records, second.Records[0])
	require.Error(t, chron.finalizeParseGeneration(ctx, logID, 2, nil, second))
	old, err = db.GetLogIdentityCatalogue(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, header, old)
	oldRows, err := db.DownloadLogIdentityCatalogueRecords(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, rows, oldRows)
	second = prepare(2, 2)
	require.NoError(t, chron.finalizeParseGeneration(ctx, logID, 2, nil, second))
	header, err = db.GetLogIdentityCatalogue(ctx, logID)
	require.NoError(t, err)
	require.Equal(t, int64(2), header.Generation)
	rows, err = db.DownloadLogIdentityCatalogueRecords(ctx, logID)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, guid.GUID(0), rows[0].Guid)
	require.Equal(t, guid.GUID(2), rows[1].Guid)
}

func TestIdentityCatalogueDefaultEngineProvenance(t *testing.T) {
	t.Parallel()
	catalogue, err := prepareIdentityCatalogue(database.InsertLogIdentityCatalogueParams{}, identitycatalog.New(nil))
	require.NoError(t, err)
	require.Equal(t, "legacy", catalogue.Header.ParserEngine)
	require.Empty(t, catalogue.Records)
}
