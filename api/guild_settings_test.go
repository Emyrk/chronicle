package api

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestValidDiscordAnnouncementScope(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		scope string
		valid bool
	}{
		{name: "raids only", scope: discordAnnouncementScopeRaidsOnly, valid: true},
		{name: "dungeons only", scope: discordAnnouncementScopeDungeonsOnly, valid: true},
		{name: "all", scope: discordAnnouncementScopeAll, valid: true},
		{name: "empty", scope: "", valid: false},
		{name: "unknown", scope: "battlegrounds", valid: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := validDiscordAnnouncementScope(test.scope); got != test.valid {
				t.Fatalf("validDiscordAnnouncementScope(%q) = %t, want %t", test.scope, got, test.valid)
			}
		})
	}
}

func TestDiscordInstallPermissions(t *testing.T) {
	t.Parallel()

	for _, permission := range []int64{
		discordgo.PermissionViewChannel,
		discordgo.PermissionSendMessages,
		discordgo.PermissionEmbedLinks,
		discordgo.PermissionAttachFiles,
		discordgo.PermissionReadMessageHistory,
		discordgo.PermissionCreatePublicThreads,
		discordgo.PermissionSendMessagesInThreads,
	} {
		require.Equal(t, permission, discordInstallPermissions&permission)
	}
}

func TestDiscordAnnouncementAttemptsPagination(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		query      string
		wantLimit  int
		wantOffset int
	}{
		{name: "defaults", wantLimit: 10},
		{name: "custom", query: "?limit=25&offset=50", wantLimit: 25, wantOffset: 50},
		{name: "caps limit", query: "?limit=500", wantLimit: 100},
		{name: "ignores invalid", query: "?limit=0&offset=-1", wantLimit: 10},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest("GET", "/attempts"+test.query, nil)
			limit, offset := discordAnnouncementAttemptsPagination(req)
			require.Equal(t, test.wantLimit, limit)
			require.Equal(t, test.wantOffset, offset)
		})
	}
}

func TestDiscordAnnouncementAttemptToSDK(t *testing.T) {
	t.Parallel()

	now := time.Now()
	row := database.ListGuildDiscordAnnouncementAttemptsRow{
		GuildDiscordLogAnnouncement: database.GuildDiscordLogAnnouncement{
			ID: uuid.New(), RunID: uuid.New(), DiscordChannelID: "channel",
			DeliveryAttemptedAt: database.Timestamptz(now),
			DeliveryError:       pgtype.Text{String: "Missing Permissions", Valid: true},
			CreatedAt:           database.Timestamptz(now.Add(-time.Minute)),
			UpdatedAt:           database.Timestamptz(now),
		},
		InstanceSlug: pgtype.Text{String: "molten-core", Valid: true},
	}

	got := discordAnnouncementAttemptToSDK(row)
	require.Equal(t, "failed", got.Status)
	require.Equal(t, "Missing Permissions", got.DeliveryError)
	require.Equal(t, "molten-core", got.InstanceSlug)
	require.NotNil(t, got.DeliveryAttemptedAt)
}
