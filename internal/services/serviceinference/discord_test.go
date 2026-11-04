package serviceinference

import (
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/jackc/pgx/v5/pgtype"
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
