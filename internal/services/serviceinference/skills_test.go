package serviceinference

import (
	"bytes"
	"context"

	"encoding/json"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRuntimeSkillsComposeConcepts(t *testing.T) {
	t.Parallel()
	original := assistants["site-help"]
	composed, err := withRuntimeSkills(original)
	require.NoError(t, err)
	require.Equal(t, original.Tools, composed.Tools[:len(original.Tools)])
	require.NotContains(t, original.System, "## Skill:")
	require.Contains(t, composed.System, "## Skill: Chronicle log concepts")
	require.Contains(t, composed.System, "encounter")
	require.Contains(t, composed.System, "parse")
	require.Len(t, debugRuntimeSkills(composed), 2)
	require.Equal(t, "chronicle-concepts", debugRuntimeSkills(composed)[0].ID)
}

func TestRuntimeSkillsRejectUnknownOrDuplicate(t *testing.T) {
	t.Parallel()
	for _, skills := range [][]string{{"not-a-skill"}, {"chronicle-concepts", "chronicle-concepts"}} {
		_, err := withRuntimeSkills(assistant{Skills: skills})
		require.Error(t, err)
	}
	duplicate := assistant{Tools: []ToolDefinition{{Name: "test_tool", Parameters: json.RawMessage(`{}`)}}, Skills: []string{"test-skill"}}
	// Keep the test independent of the global registry: a skill's advertised tools may not shadow an assistant tool.
	_, err := composeRuntimeSkills(duplicate, map[string]runtimeSkill{"test-skill": {ID: "test-skill", Tools: []ToolDefinition{{Name: "test_tool"}}}})
	require.Error(t, err)
}

func TestAgentLoopRejectsUnadvertisedToolCall(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{streams: [][]StreamEvent{
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "call-1", Name: "list_pages", Arguments: "{}"}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
		{{Type: StreamEventTextDelta, Text: "I cannot access that tool."}, {Type: StreamEventFinish, FinishReason: FinishReasonStop}},
	}}
	var stream bytes.Buffer
	var messages []Message
	_, err := (&Service{}).agentLoop(context.Background(), agui.NewStreamWriter(&stream, nil), provider, nil, "model", assistants["instance-analyst"], []Message{{Role: RoleUser, Content: "list pages"}}, toolContext{}, debugRunContext{}, nil, agentLoopState{}, func(batch ...Message) error { messages = append(messages, batch...); return nil }, nil, nil)
	require.NoError(t, err)
	require.NotContains(t, stream.String(), `"/recent"`)
	require.Equal(t, `{"error":"invalid tool request"}`, messages[1].Content)
}
