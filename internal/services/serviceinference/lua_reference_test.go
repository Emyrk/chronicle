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
	t.Logf("canonical=%d bytes, overview=%d bytes, sections=%d", len(frontend.ModuleAPIReference), len(skills[0].Instructions), len(skills)-1)
	var reconstructed strings.Builder
	seen := map[string]bool{}
	for _, skill := range skills {
		require.False(t, seen[skill.ID], skill.ID)
		seen[skill.ID] = true
		if skill.ID != luaModuleAPISkillID {
			reconstructed.WriteString(skill.Instructions)
			require.Contains(t, frontend.ModuleAPIReference, skill.Instructions)
		}
		encoded, err := json.Marshal(luaReferenceResponse(skill))
		require.NoError(t, err)
		envelope, err := json.Marshal(map[string]any{"result": string(encoded)})
		require.NoError(t, err)
		require.Less(t, len(envelope), (64<<10)-4096)
	}
	require.Equal(t, frontend.ModuleAPIReference, reconstructed.String(), "every source byte is retrievable exactly once")
	require.Less(t, len(skills[0].Instructions), len(frontend.ModuleAPIReference)/3)
	require.NotContains(t, luaWorkshopSystem, "Chronicle.GetUnit")
	for _, title := range []string{"How a module runs", "Standard library", "Limits", "Performance"} {
		for _, skill := range skills[1:] {
			if skill.Name == title {
				require.Contains(t, skills[0].Instructions, skill.Instructions)
			}
		}
	}
}

func TestLuaReferenceFencesAndValidation(t *testing.T) {
	t.Parallel()
	source := "# Reference\n## First\n````lua\n## Not a section\n```\n### Still fenced\n````\n   ~~~lua\n## Also fenced\n   ~~~\n## Second\n### Detail\ntext\n"
	skills, err := buildLuaReferenceSkills(source)
	require.NoError(t, err)
	require.Len(t, skills, 5)
	require.Equal(t, "lua-module-api-second-detail", skills[4].ID)
	_, err = buildLuaReferenceSkills("## Same\na\n## Same\nb\n")
	require.ErrorContains(t, err, "duplicate")
	_, err = buildLuaReferenceSkills("## Large\n" + strings.Repeat("x", 25<<10))
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
