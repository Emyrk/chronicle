package database_test

import (
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestCustomPanelReleaseInstallationLifecycle(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "panels-" + userID.String()[:8]})
	require.NoError(t, err)

	_, err = store.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
		UserID: userID, Enabled: true, ExpectedRevision: 99,
	})
	require.True(t, errors.Is(err, pgx.ErrNoRows))

	created, err := store.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
		UserID: userID, Enabled: true, ExpectedRevision: 0,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), created.Revision)

	_, err = store.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
		UserID: userID, Enabled: false, ExpectedRevision: 0,
	})
	require.True(t, errors.Is(err, pgx.ErrNoRows))

	manifest := []byte(`{"schema_version":1,"artifacts":{"entry":{"path":"dist/panel.js","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":1}}}`)
	release1, err := store.InsertCustomPanelRelease(ctx, database.InsertCustomPanelReleaseParams{
		Repository: "owner/repo", CommitSha: "1111111111111111111111111111111111111111", Manifest: manifest, ManifestSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	})
	require.NoError(t, err)
	release1Again, err := store.InsertCustomPanelRelease(ctx, database.InsertCustomPanelReleaseParams{
		Repository: "owner/repo", CommitSha: release1.CommitSha, Manifest: manifest, ManifestSha256: release1.ManifestSha256,
	})
	require.NoError(t, err)
	require.Equal(t, release1.ID, release1Again.ID)

	installed, err := store.UpsertUserCustomPanelInstallation(ctx, database.UpsertUserCustomPanelInstallationParams{
		UserID: userID, Repository: "owner/repo", ReleaseID: release1.ID, InstalledRef: "main", Enabled: true,
	})
	require.NoError(t, err)

	time.Sleep(time.Millisecond)
	release2, err := store.InsertCustomPanelRelease(ctx, database.InsertCustomPanelReleaseParams{
		Repository: "owner/repo", CommitSha: "2222222222222222222222222222222222222222", Manifest: manifest, ManifestSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	})
	require.NoError(t, err)
	updated, err := store.UpsertUserCustomPanelInstallation(ctx, database.UpsertUserCustomPanelInstallationParams{
		UserID: userID, Repository: "owner/repo", ReleaseID: release2.ID, InstalledRef: "main", Enabled: installed.Enabled,
	})
	require.NoError(t, err)
	require.Equal(t, installed.InstalledAt, updated.InstalledAt)
	require.True(t, updated.Enabled)
	require.True(t, updated.UpdatedAt.Time.After(installed.UpdatedAt.Time) || updated.UpdatedAt.Time.Equal(installed.UpdatedAt.Time))

	rows, err := store.ListUserCustomPanelInstallations(ctx, userID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, release2.ID, rows[0].CustomPanelRelease.ID)

	deleted, err := store.DeleteOrphanCustomPanelReleases(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), deleted)

	err = store.DeleteUserCustomPanelInstallationsExcept(ctx, database.DeleteUserCustomPanelInstallationsExceptParams{UserID: userID, Repositories: []string{}})
	require.NoError(t, err)
	rows, err = store.ListUserCustomPanelInstallations(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, rows)

	deleted, err = store.DeleteOrphanCustomPanelReleases(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), deleted)

	updatedSettings, err := store.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
		UserID: userID, Enabled: false, ExpectedRevision: 1,
	})
	require.NoError(t, err)
	require.Equal(t, int64(2), updatedSettings.Revision)
	require.False(t, updatedSettings.Enabled)
}
