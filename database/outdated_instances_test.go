package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/semverenc"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestAdminListOutdatedParserVersionInstancesUsesFullVersion(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "outdated-instances-user-" + userID.String()[:8],
	})
	require.NoError(t, err)

	insertInstance := func(parserVersion string) uuid.UUID {
		t.Helper()

		now := time.Now()
		logGroupID := uuid.New()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID:        logGroupID,
			Owner:     userID,
			LogType:   database.LogTypeV1,
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

		_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{
			ID:        uuid.New(),
			Owner:     userID,
			Hash:      uuid.NewString(),
			WowLogID:  logGroupID,
			SizeBytes: 1,
			MimeType:  "text/plain",
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		require.NoError(t, err)

		instanceID := uuid.New()
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID:            instanceID,
			RealmID:       realmID,
			LogGroupID:    logGroupID,
			Name:          "Version Test " + parserVersion,
			HashedSlug:    pgtype.Text{String: instanceID.String(), Valid: true},
			StartTime:     database.Timestamptz(now),
			EndTime:       database.Timestamptz(now.Add(time.Minute)),
			Capabilities:  []string{},
			ParserVersion: parserVersion,
		})
		require.NoError(t, err)
		return instanceID
	}

	oldPreV1ID := insertInstance("v0.0.4010+old")
	oldV1ID := insertInstance("v1.0.17+old")
	insertInstance("v1.0.18+current")
	insertInstance("v1.0.19+newer")

	rows, err := store.AdminListOutdatedParserVersionInstances(ctx, database.AdminListOutdatedParserVersionInstancesParams{
		MinParserVersionNum: semverenc.Encode("v1.0.18"),
	})
	require.NoError(t, err)

	gotIDs := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		gotIDs = append(gotIDs, row.ID)
	}
	require.ElementsMatch(t, []uuid.UUID{oldPreV1ID, oldV1ID}, gotIDs)
}
