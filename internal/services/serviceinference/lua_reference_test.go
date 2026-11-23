package serviceinference

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"github.com/stretchr/testify/require"
)

func TestLuaReferenceCatalog(t *testing.T) {
	t.Parallel()
	skills, err := buildLuaReferenceSkills(frontend.ModuleAPIReference)
	require.NoError(t, err)
	require.Equal(t, luaReferenceSkills, skills)
	expected := []string{"getting-started", "project-configuration", "events", "units", "ui-foundations", "text-textures-interaction", "player-metric-charts", "line-charts", "canvas", "breakout-panels", "time-replay", "runtime-publishing"}
	require.Len(t, skills, len(expected)+1)
	core := frontend.ModuleAPIReference[:strings.Index(frontend.ModuleAPIReference, "<!-- LUA API TOPIC:")]
	require.True(t, strings.HasPrefix(skills[0].Instructions, core))
	var reconstructed strings.Builder
	reconstructed.WriteString(core)
	for i, skill := range skills {
		if i > 0 {
			require.Equal(t, "lua-module-api-"+expected[i-1], skill.ID)
			reconstructed.WriteString(skill.Instructions)
			require.Contains(t, frontend.ModuleAPIReference, skill.Instructions)
			require.Contains(t, skills[0].Instructions, `read_skill({"skill_id":"`+skill.ID+`"})`)
		}
		encoded, err := json.Marshal(luaReferenceResponse(skill))
		require.NoError(t, err)
		envelope, err := json.Marshal(map[string]any{"result": string(encoded)})
		require.NoError(t, err)
		require.Less(t, len(envelope), (64<<10)-4096)
		t.Logf("%s: text=%d JSON=%d envelope=%d bytes", skill.ID, len(skill.Instructions), len(encoded), len(envelope))
	}
	require.Equal(t, frontend.ModuleAPIReference, reconstructed.String(), "core plus topics must cover every source byte exactly once")
	require.Less(t, len(skills[0].Instructions), 8<<10)
	require.NotContains(t, luaWorkshopSystem, "Chronicle.GetUnit")
	for _, title := range []string{"How a module runs", "Standard library", "Limits", "Performance"} {
		require.Contains(t, core, "## "+title)
	}
	require.Contains(t, core, "no network, file or page access")
	require.Contains(t, core, "humans are not the target audience")
	// A complete topic contains both its explanatory prose and signatures.
	for id, wants := range map[string][]string{
		"units":                {"## Units", "#### `Chronicle.GetUnit", "#### `Chronicle.GetPlayers"},
		"player-metric-charts": {"local ui = require", "## Player metric chart", "#### `ChroniclePlayerMetricChart:SetData", "## Example: damage by player"},
		"line-charts":          {"## Line chart", "#### `ChronicleLineChart:SetSeries"},
		"events":               {"### Streams and fields", "#### `Panel:OnEvent", "#### `Panel:OnComplete"},
	} {
		for _, skill := range skills[1:] {
			if skill.ID == "lua-module-api-"+id {
				for _, want := range wants {
					require.Contains(t, skill.Instructions, want)
				}
			}
		}
	}
}

func TestLuaReferenceFencesAndValidation(t *testing.T) {
	t.Parallel()
	marker := "<!-- LUA API TOPIC: first | First topic | Use for a first task. -->\n"
	second := "<!-- LUA API TOPIC: second | Second topic | Use for another task. -->\n"
	source := "# Core\n" + marker + "## Prose heading\n````lua\n" + second + "```\n" + second + "````\n   ~~~lua\n" + second + "   ~~~\n" + second + "## Detail\ntext\n"
	skills, err := buildLuaReferenceSkills(source)
	require.NoError(t, err)
	require.Len(t, skills, 3)
	require.Equal(t, "lua-module-api-second", skills[2].ID)
	renamed, err := buildLuaReferenceSkills(strings.ReplaceAll(source, "## Detail", "## Renamed heading"))
	require.NoError(t, err)
	require.Equal(t, skills[2].ID, renamed[2].ID)
	for _, source := range []string{
		"# No topics", marker,
		"# Core\n<!-- LUA API TOPIC: ../bad | Bad | Bad. -->\n",
		"# Core\n<!-- LUA API TOPIC: first | | Missing title. -->\n",
		"# Core\n" + marker + marker,
		"# Core\n<!-- LUA API TOPIC: " + strings.Repeat("a", 100) + " | Too long | Bad. -->\n",
	} {
		_, err := buildLuaReferenceSkills(source)
		require.Error(t, err, source)
	}
	_, err = buildLuaReferenceSkills("# Core\n" + marker + strings.Repeat("x", 25<<10))
	require.ErrorContains(t, err, "budget")
	_, err = buildLuaReferenceSkills(strings.Repeat("x", 25<<10) + "\n" + marker)
	require.ErrorContains(t, err, "budget")
}

func TestWorkshopReadsLuaReference(t *testing.T) {
	t.Parallel()
	a := assistants[addonWorkshopPanelAssistantID]
	require.True(t, assistantAllowsTool(a, "read_skill"))
	require.False(t, assistantAllowsTool(assistants["site-help"], "read_skill"))
	require.False(t, assistantAllowsTool(assistants["instance-analyst"], "read_skill"))
	s := &Service{} // No provider, database, project access, or browser needed.
	for _, skill := range luaReferenceSkills {
		args, err := json.Marshal(map[string]string{"skill_id": skill.ID})
		require.NoError(t, err)
		output, err := s.executeTool(context.Background(), toolContext{}, "read_skill", string(args))
		require.NoError(t, err)
		var response chroniclesdk.InferenceClientSkillResponse
		require.NoError(t, json.Unmarshal([]byte(output), &response))
		require.Equal(t, luaReferenceResponse(skill), response)
	}
	for _, args := range []string{`{}`, `null`, `{"skill_id":"../secret"}`, `{"skill_id":"unknown"}`, `{"skill_id":"chronicle-concepts"}`, `{"skill_id":1}`, `{"skill_id":"lua-module-api","extra":true}`, `{"skill_id":"lua-module-api"} {}`} {
		_, err := s.executeTool(context.Background(), toolContext{}, "read_skill", args)
		require.Error(t, err, args)
	}
}

func TestWorkshopReferenceToolLoop(t *testing.T) {
	t.Parallel()
	capability := &clientCapability{ID: luaEditorCapabilityID, Version: 1, ScopeType: "lua_project", ScopeID: "project", SessionID: "browser"}
	provider := &scriptedProvider{streams: [][]StreamEvent{
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "reference", Name: "read_skill", Arguments: `{"skill_id":"lua-module-api-units"}`}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
		{{Type: StreamEventTextDelta, Text: "Read the units reference."}, {Type: StreamEventFinish, FinishReason: FinishReasonStop}},
	}}
	var stream strings.Builder
	var persisted []Message
	result, err := (&Service{}).agentLoop(context.Background(), agui.NewStreamWriter(&stream, nil), provider, nil, "model", withClientTools(assistants[addonWorkshopPanelAssistantID], capability), []Message{{Role: RoleUser, Content: "Read unit documentation"}}, toolContext{}, debugRunContext{}, capability, agentLoopState{}, func(batch ...Message) error { persisted = append(persisted, batch...); return nil }, func(_ Message, _ []Message, _ clientToolPause, _ agentLoopState) error {
		t.Fatal("documentation must not pause for the browser")
		return nil
	}, nil)
	require.NoError(t, err)
	require.Nil(t, result.Paused)
	require.Equal(t, 2, provider.calls)
	require.NotContains(t, stream.String(), "CLIENT_TOOL_REQUEST")
	found := false
	for _, message := range persisted {
		if message.Role == RoleTool && message.Name == "read_skill" {
			found = true
			expected, err := readLuaReference(`{"skill_id":"lua-module-api-units"}`)
			require.NoError(t, err)
			require.JSONEq(t, expected, message.Content)
		}
	}
	require.True(t, found)
}
