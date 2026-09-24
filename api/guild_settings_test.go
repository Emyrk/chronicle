package api

import (
	"net/http"
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
	} {
		require.Equal(t, permission, discordInstallPermissions&permission)
	}
	for _, permission := range []int64{
		discordgo.PermissionCreatePublicThreads,
		discordgo.PermissionSendMessagesInThreads,
	} {
		require.Zero(t, discordInstallPermissions&permission)
	}
}

func TestDiscordInstallCallbackURL(t *testing.T) {
	t.Parallel()

	accessURL := mustParseURL("https://legacy.chronicleclassic.com")
	api := &API{Opts: &Options{AccessURL: accessURL}}
	require.Equal(t,
		"https://legacy.chronicleclassic.com/api/v1/discord-integration/callback",
		api.discordInstallCallbackURL(),
	)
}

func TestDiscordInstallCookie(t *testing.T) {
	t.Parallel()

	before := time.Now()
	cookie := discordInstallCookie(
		mustParseURL("https://legacy.chronicleclassic.com"),
		"chronicleclassic.com",
		"install-state",
	)

	require.Equal(t, discordInstallCorrelationCookie, cookie.Name)
	require.Equal(t, "install-state", cookie.Value)
	require.Equal(t, discordInstallCallbackPath, cookie.Path)
	require.Equal(t, "chronicleclassic.com", cookie.Domain)
	require.True(t, cookie.HttpOnly)
	require.True(t, cookie.Secure)
	require.Equal(t, http.SameSiteLaxMode, cookie.SameSite)
	require.Equal(t, int(discordInstallStateLifetime.Seconds()), cookie.MaxAge)
	require.WithinDuration(t, before.Add(discordInstallStateLifetime), cookie.Expires, time.Second)
}

func TestValidDiscordInstallCorrelation(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		state       string
		cookieValue string
		want        bool
	}{
		{name: "matching", state: "install-state", cookieValue: "install-state", want: true},
		{name: "missing state", cookieValue: "install-state"},
		{name: "missing cookie", state: "install-state"},
		{name: "mismatched", state: "install-state", cookieValue: "other-state"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest(http.MethodGet, discordInstallCallbackPath+"?state="+test.state, nil)
			if test.cookieValue != "" {
				req.AddCookie(&http.Cookie{Name: discordInstallCorrelationCookie, Value: test.cookieValue})
			}
			require.Equal(t, test.want, validDiscordInstallCorrelation(req, test.state))
		})
	}
}

func TestDiscordInstallReturnURL(t *testing.T) {
	t.Parallel()

	accessURL := mustParseURL("https://legacy.chronicleclassic.com")
	guildID := uuid.MustParse("00000000-0000-0000-0000-000000000123")

	tests := []struct {
		name          string
		primaryDomain string
		tenantSlug    pgtype.Text
		want          string
	}{
		{
			name: "primary domain",
			want: "https://legacy.chronicleclassic.com/g/00000000-0000-0000-0000-000000000123/settings?" +
				"tab=discord-integration",
		},
		{
			name:          "tenant domain",
			primaryDomain: "chronicleclassic.com",
			tenantSlug:    pgtype.Text{String: "turtle", Valid: true},
			want: "https://turtle.chronicleclassic.com/g/00000000-0000-0000-0000-000000000123/settings?" +
				"tab=discord-integration",
		},
		{
			name:       "tenant without configured primary domain",
			tenantSlug: pgtype.Text{String: "turtle", Valid: true},
			want: "https://legacy.chronicleclassic.com/g/00000000-0000-0000-0000-000000000123/settings?" +
				"tab=discord-integration",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.want, discordInstallReturnURL(accessURL, test.primaryDomain, test.tenantSlug, guildID))
		})
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
		{name: "defaults", wantLimit: 5},
		{name: "custom", query: "?limit=25&offset=50", wantLimit: 25, wantOffset: 50},
		{name: "caps limit", query: "?limit=500", wantLimit: 100},
		{name: "ignores invalid", query: "?limit=0&offset=-1", wantLimit: 5},
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
