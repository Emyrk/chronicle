package serviceriver

import (
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAccountPurgeNotificationArgs(t *testing.T) {
	t.Parallel()

	userID, purgeID := uuid.New(), uuid.New()
	args := accountPurgeNotificationArgs(chronicle.AccountPurgeNotification{
		PurgeID: purgeID, UserID: userID, Username: "Thrall", Email: "thrall@example.com",
		Status: chronicle.AccountPurgeSucceeded, LogsDeleted: 142,
	})
	require.Equal(t, "Account purged", args.Title)
	require.Empty(t, args.URL)
	require.Equal(t, []chroniclebot.AdminNotificationField{
		{Name: "User", Value: "Thrall", Inline: true},
		{Name: "Email", Value: "thrall@example.com", Inline: true},
		{Name: "Logs deleted", Value: "142", Inline: true},
		{Name: "User ID", Value: userID.String()},
		{Name: "Purge", Value: purgeID.String()},
	}, args.Fields)

	failed := accountPurgeNotificationArgs(chronicle.AccountPurgeNotification{
		PurgeID: purgeID, UserID: userID, Status: chronicle.AccountPurgeFailed, Error: strings.Repeat("x", 2000),
	})
	require.Equal(t, "Account purge failed", failed.Title)
	require.Equal(t, "Unknown", failed.Fields[0].Value)
	last := failed.Fields[len(failed.Fields)-1]
	require.Equal(t, "Error", last.Name)
	require.Len(t, last.Value, 1024)
}
