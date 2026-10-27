package chroniclebot

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/paidtier"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type tierRoleTestStore struct {
	database.Store
	userID uuid.UUID
	roles  []database.BillingEntitlement
}

func (s *tierRoleTestStore) GetUserAuthLinkByUserIDAndProvider(_ context.Context, arg database.GetUserAuthLinkByUserIDAndProviderParams) (database.UserAuthLink, error) {
	if arg.UserID != s.userID || arg.Provider != "discord" {
		return database.UserAuthLink{}, fmt.Errorf("unexpected auth link lookup: %v", arg)
	}
	return database.UserAuthLink{UserID: s.userID, LinkedID: "discord-user", Provider: "discord"}, nil
}

func (s *tierRoleTestStore) ListBillingEntitlementsByUserID(_ context.Context, userID uuid.UUID) ([]database.BillingEntitlement, error) {
	if userID != s.userID {
		return nil, fmt.Errorf("unexpected entitlement lookup: %s", userID)
	}
	return s.roles, nil
}

type tierRoleTransport func(*http.Request) (*http.Response, error)

func (f tierRoleTransport) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func TestSyncEntitlementRolesUpdatesOnlyConfiguredGuildRoles(t *testing.T) {
	t.Parallel()
	userID := uuid.New()
	store := &tierRoleTestStore{userID: userID, roles: []database.BillingEntitlement{{EntitlementKey: "chronicle-revered"}}}
	session, err := discordgo.New("Bot test")
	require.NoError(t, err)
	var mutations []string
	session.Client.Transport = tierRoleTransport(func(req *http.Request) (*http.Response, error) {
		path := req.URL.Path
		status, body := http.StatusNoContent, ""
		switch req.Method {
		case http.MethodGet:
			require.True(t, strings.HasSuffix(path, "/guilds/guild/members/discord-user"), path)
			status, body = http.StatusOK, `{"user":{"id":"discord-user"},"roles":["honored","unrelated"]}`
		case http.MethodPut, http.MethodDelete:
			mutations = append(mutations, req.Method+" "+path)
		default:
			t.Errorf("unexpected Discord request: %s %s", req.Method, path)
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}, Request: req}, nil
	})
	bot := &Bot{session: session, config: Config{
		GuildID: "guild", HonoredRoleID: "honored", ReveredRoleID: "revered", ExaltedRoleID: "exalted", DB: store,
	}}
	require.NoError(t, bot.SyncEntitlementRoles(context.Background(), userID))
	require.Equal(t, []string{
		"DELETE /api/v9/guilds/guild/members/discord-user/roles/honored",
		"PUT /api/v9/guilds/guild/members/discord-user/roles/revered",
	}, mutations)
}

func TestTierRoleDiff(t *testing.T) {
	t.Parallel()
	config := Config{HonoredRoleID: "honored", ReveredRoleID: "revered", ExaltedRoleID: "exalted"}
	for _, tc := range []struct {
		name    string
		present []string
		tier    string
		remove  []string
		add     string
	}{
		{name: "new honored", present: []string{"unrelated"}, tier: paidtier.Honored, add: "honored"},
		{name: "promote", present: []string{"honored", "unrelated"}, tier: paidtier.Revered, remove: []string{"honored"}, add: "revered"},
		{name: "repair cumulative", present: []string{"honored", "revered", "exalted"}, tier: paidtier.Exalted, remove: []string{"honored", "revered"}},
		{name: "revoke", present: []string{"exalted", "unrelated"}, tier: paidtier.Free, remove: []string{"exalted"}},
		{name: "no-op", present: []string{"revered", "unrelated"}, tier: paidtier.Revered},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			remove, add := tierRoleDiff(config, tc.present, tc.tier)
			require.Equal(t, tc.remove, remove)
			require.Equal(t, tc.add, add)
		})
	}
}

func TestValidateTierRoleConfig(t *testing.T) {
	t.Parallel()
	require.NoError(t, validateTierRoleConfig(Config{}))
	require.Error(t, validateTierRoleConfig(Config{GuildID: "guild", HonoredRoleID: "honored"}))
	require.Error(t, validateTierRoleConfig(Config{GuildID: "guild", HonoredRoleID: "same", ReveredRoleID: "same", ExaltedRoleID: "exalted"}))
	require.ErrorContains(t, validateTierRoleConfig(Config{GuildID: "guild", HonoredRoleID: boosterRoleID, ReveredRoleID: "revered", ExaltedRoleID: "exalted"}), "Booster or Supporter")
	require.ErrorContains(t, validateTierRoleConfig(Config{GuildID: "guild", HonoredRoleID: "honored", ReveredRoleID: supporterRoleID, ExaltedRoleID: "exalted"}), "Booster or Supporter")
	require.NoError(t, validateTierRoleConfig(Config{GuildID: "guild", HonoredRoleID: "honored", ReveredRoleID: "revered", ExaltedRoleID: "exalted"}))
}
