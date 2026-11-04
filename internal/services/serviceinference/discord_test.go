package serviceinference

import (
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/serviceinstancesearch"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
)

func TestDiscordAssistantComposesConceptsWithoutBrowserTools(t *testing.T) {
	t.Parallel()
	composed, err := withRuntimeSkills(discordAssistant)
	require.NoError(t, err)
	require.Contains(t, composed.System, "## Skill: Chronicle log concepts")
	require.True(t, assistantAllowsTool(composed, "search_instances"))
	require.False(t, assistantAllowsTool(composed, "set_search_draft"))
}

func TestDiscordSearchTenantRequiresValidatedSlug(t *testing.T) {
	t.Parallel()
	service := &Service{tenant: servicetenant.NewTestWithTenants(url.URL{}, "chronicle.example", database.Tenant{Name: "Turtle", Slug: pgtype.Text{String: "turtle", Valid: true}})}
	tenant, err := service.resolveSearchTenant("turtle")
	require.NoError(t, err)
	require.Equal(t, "turtle", tenant.Slug.String)
	for _, invalid := range []string{"", "unknown", "turtle.evil.com", " turtle", "turtle/../other"} {
		_, err = service.resolveSearchTenant(invalid)
		require.Error(t, err, invalid)
	}
}

func TestDiscordSearchUsesSharedAdmission(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	db, _ := dbtestutil.NewDB(t)
	tenant := database.Tenant{ID: uuid.New(), Name: "Turtle", Slug: pgtype.Text{String: "turtle", Valid: true}}
	search := serviceinstancesearch.New(testutil.Logger(t), db, prometheus.NewRegistry(), nil)
	service := &Service{tenant: servicetenant.NewTestWithTenants(url.URL{}, "chronicle.example", tenant), instanceSearch: search}
	user := uuid.New()
	_, first := search.Search(ctx, serviceinstancesearch.Caller{UserID: user, TenantID: tenant.ID}, chroniclesdk.InstanceSearchQuery{})
	require.NoError(t, first.Err)
	require.Positive(t, first.RuntimeCost)
	output, err := service.searchInstances(ctx, toolContext{userID: user, tenantSlug: "turtle"}, `{}`)
	require.NoError(t, err)
	require.Contains(t, output, `"cost":1`)
	status, _, err := search.Peek(ctx, serviceinstancesearch.Caller{UserID: user, TenantID: tenant.ID})
	require.NoError(t, err)
	require.InDelta(t, 96, status.Remaining, 1)
}

func TestDiscordAnswerOnlyCollectsAssistantText(t *testing.T) {
	t.Parallel()
	stream := []byte("id: 1\nevent: TEXT_MESSAGE_CONTENT\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"delta\":\"Hello \"}\n\nid: 2\nevent: TOOL_CALL_ARGS\ndata: {\"type\":\"TOOL_CALL_ARGS\",\"delta\":\"secret\"}\n\nid: 3\nevent: TEXT_MESSAGE_CONTENT\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"delta\":\"there\"}\n\n")
	var collector discordTextCollector
	_, err := collector.Write(stream)
	require.NoError(t, err)
	_, err = collector.Write([]byte("id: 4\nevent: TEXT_MESSAGE_START\ndata: {\"type\":\"TEXT_MESSAGE_START\"}\n\n"))
	require.NoError(t, err)
	_, err = collector.Write([]byte("id: 5\nevent: TEXT_MESSAGE_CONTENT\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"delta\":\"Final answer\"}\n\n"))
	require.NoError(t, err)
	require.Equal(t, "Final answer", collector.text.String())
}
