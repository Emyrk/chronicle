package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestInsertWoWLogGroupUploadSource(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "upload-source-" + userID.String()[:8],
	})
	require.NoError(t, err)

	tests := []struct {
		name   string
		source string
		want   database.UploadSource
	}{
		{name: "legacy default", want: database.UploadSourceUnknown},
		{name: "web", source: string(database.UploadSourceWeb), want: database.UploadSourceWeb},
		{name: "sidekick", source: string(database.UploadSourceSidekick), want: database.UploadSourceSidekick},
		{name: "server", source: string(database.UploadSourceServer), want: database.UploadSourceServer},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			groupID := uuid.New()
			now := database.Timestamptz(time.Now())
			group, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
				ID:           groupID,
				Owner:        userID,
				LogType:      database.LogTypeV2,
				UploadSource: tt.source,
				CreatedAt:    now,
				UpdatedAt:    now,
			})
			require.NoError(t, err)
			require.Equal(t, tt.want, group.UploadSource)

			stored, err := store.GetWoWLogGroupByID(ctx, groupID)
			require.NoError(t, err)
			require.Equal(t, tt.want, stored.WoWLogGroup.UploadSource)
		})
	}
}
