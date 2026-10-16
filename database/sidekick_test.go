package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSidekickLifecycleAndIssues(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "sidekick-" + userID.String()[:8],
	})
	require.NoError(t, err)

	installationID := uuid.New()
	installation, err := db.UpsertSidekickInstallation(ctx, database.UpsertSidekickInstallationParams{
		ID: installationID, UserID: userID, Name: "Raid laptop", Platform: "windows", Version: "1.2.3",
	})
	require.NoError(t, err)
	require.Equal(t, installationID, installation.ID)

	const requestID = "oauth-request"
	require.NoError(t, db.InsertSidekickOAuthGrant(ctx, database.InsertSidekickOAuthGrantParams{
		OauthRequestID: requestID, SidekickID: installationID,
	}))
	resolvedInstallationID, err := db.GetSidekickInstallationForOAuthRequest(ctx, database.GetSidekickInstallationForOAuthRequestParams{
		OauthRequestID: requestID, UserID: userID,
	})
	require.NoError(t, err)
	require.Equal(t, installationID, resolvedInstallationID)

	installation, err = db.UpdateSidekickHeartbeat(ctx, database.UpdateSidekickHeartbeatParams{
		ID: installationID, UserID: userID, Platform: "linux", Version: "1.2.4",
	})
	require.NoError(t, err)
	require.True(t, installation.LastSeenAt.Valid)
	require.Equal(t, "linux", installation.Platform)

	require.NoError(t, db.UpsertSidekickWoWDirectory(ctx, database.UpsertSidekickWoWDirectoryParams{
		SidekickID: installationID, Path: `C:\\Games\\CapyCraft`, TenantName: "CapyCraft",
		TenantBaseUrl: "https://capy.chronicleclassic.com", Realmlist: "apac.capycraft.io",
	}))
	require.NoError(t, db.UpsertSidekickWoWDirectory(ctx, database.UpsertSidekickWoWDirectoryParams{
		SidekickID: installationID, Path: `C:\\Games\\Warmane`, TenantName: "Warmane",
		TenantBaseUrl: "https://warmane.chronicleclassic.com", Realmlist: "logon.warmane.com",
	}))
	directories, err := db.ListSidekickWoWDirectories(ctx, installationID)
	require.NoError(t, err)
	require.Len(t, directories, 2)
	_, err = db.DeleteSidekickWoWDirectoriesExcept(ctx, database.DeleteSidekickWoWDirectoriesExceptParams{
		SidekickID: installationID, ActivePaths: []string{`C:\\Games\\Warmane`},
	})
	require.NoError(t, err)
	directories, err = db.ListSidekickWoWDirectories(ctx, installationID)
	require.NoError(t, err)
	require.Len(t, directories, 1)
	require.Equal(t, "Warmane", directories[0].TenantName)

	issue, err := db.UpsertActiveSidekickIssue(ctx, database.UpsertActiveSidekickIssueParams{
		SidekickID: installationID, Code: "upload_failed", Message: "Upload failed", Details: "connection reset",
	})
	require.NoError(t, err)
	updatedIssue, err := db.UpsertActiveSidekickIssue(ctx, database.UpsertActiveSidekickIssueParams{
		SidekickID: installationID, Code: "upload_failed", Message: "Upload still failing", Details: "timeout",
	})
	require.NoError(t, err)
	require.Equal(t, issue.ID, updatedIssue.ID)
	require.Equal(t, "Upload still failing", updatedIssue.Message)

	_, err = db.ResolveSidekickIssuesExcept(ctx, database.ResolveSidekickIssuesExceptParams{
		SidekickID: installationID, ActiveCodes: []string{},
	})
	require.NoError(t, err)
	issues, err := db.ListSidekickIssues(ctx, database.ListSidekickIssuesParams{SidekickID: installationID, LimitCount: 20})
	require.NoError(t, err)
	require.Len(t, issues, 1)
	require.True(t, issues[0].ResolvedAt.Valid)

	revokedRequestIDs, err := db.RevokeActiveSidekickOAuthGrants(ctx, installationID)
	require.NoError(t, err)
	require.Equal(t, []string{requestID}, revokedRequestIDs)
}
