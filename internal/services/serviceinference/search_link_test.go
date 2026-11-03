package serviceinference

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/services/serviceinference/agui"
	"github.com/stretchr/testify/require"
)

func TestSiteHelpSearchLinkTool(t *testing.T) {
	t.Parallel()
	a, err := withRuntimeSkills(assistants["site-help"])
	require.NoError(t, err)
	require.True(t, assistantAllowsTool(a, "build_instance_search_link"))
	require.True(t, assistantAllowsTool(a, "describe_instance_search"))
	require.Contains(t, a.System, "## Skill: Chronicle instance search")
	require.Equal(t, []string{"chronicle-concepts", "instance-search"}, a.Skills)
	require.Len(t, debugRuntimeSkills(a), 2)
	_, example, found := strings.Cut(a.System, "- A raid with the same druid playing Bear and Cat on boss kills: ")
	require.True(t, found)
	example, _, found = strings.Cut(example, "\nKeep both")
	require.True(t, found)
	var input struct {
		Where *instancesearch.Node `json:"where"`
	}
	require.NoError(t, decodeStrict(example, &input))
	require.NotNil(t, input.Where)
	_, err = instancesearch.Compile(instancesearch.Query{Where: input.Where}, instancesearch.Options{})
	require.NoError(t, err)
	require.False(t, assistantAllowsTool(a, "search_instances"))
}

func TestBuildInstanceSearchLink(t *testing.T) {
	t.Parallel()
	input := `{"where":{"and":[{"field":"instance.name","op":"=","value":"Naxxramas"},{"any_player":{"field":"player.name","op":"=","value":"Étoile"}}]}}`
	output, err := (&Service{}).executeTool(context.Background(), toolContext{}, "build_instance_search_link", input)
	require.NoError(t, err)
	var result struct {
		URL string `json:"url"`
	}
	require.NoError(t, json.Unmarshal([]byte(output), &result))
	require.True(t, strings.HasPrefix(result.URL, "/search?q="), result.URL)
	require.NotContains(t, result.URL, "É")
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(result.URL, "/search?q="))
	require.NoError(t, err)
	var decoded instancesearch.Node
	require.NoError(t, json.Unmarshal(raw, &decoded))
	require.Equal(t, "Naxxramas", decoded.And[0].Value)
	require.Equal(t, "Étoile", decoded.And[1].AnyPlayer.Value)
	_, err = instancesearch.Compile(instancesearch.Query{Where: &decoded}, instancesearch.Options{})
	require.NoError(t, err)
}

func TestBuildInstanceSearchLinkRejectsInvalidInput(t *testing.T) {
	t.Parallel()
	for _, input := range []string{
		`{}`, `{"where":null}`, `{"where":{"field":"unknown","op":"=","value":"x"}}`,
		`{"where":{"field":"player.class","op":"=","value":"PRIEST"}}`,
		`{"where":{"field":"instance.name","op":"<","value":"Naxxramas"}}`,
		`{"where":{"field":"instance.name","op":"=","value":"x","unrecognized":true}}`,
		`{"where":{"field":"instance.name","op":"=","value":"x"},"limit":100}`,
		`{"where":{"field":"instance.name","op":"=","value":"` + strings.Repeat("a", 5000) + `"}}`,
		`{"where":{"field":"instance.name","op":"in","value":[` + strings.TrimSuffix(strings.Repeat(`"`+strings.Repeat("a", 120)+`",`, 40), ",") + `]}}`,
	} {
		_, err := (&Service{}).executeTool(context.Background(), toolContext{}, "build_instance_search_link", input)
		require.Error(t, err, input)
	}
}

func TestDescribeInstanceSearchOnlyReturnsReference(t *testing.T) {
	t.Parallel()
	output, err := (&Service{}).executeTool(context.Background(), toolContext{}, "describe_instance_search", `{}`)
	require.NoError(t, err)
	require.Contains(t, output, "instance.name")
	require.Contains(t, output, "player.name")
	_, err = (&Service{}).executeTool(context.Background(), toolContext{}, "describe_instance_search", `{"ignore":true}`)
	require.Error(t, err)
}

func TestSearchLinkValidationFeedsBackAndRecovers(t *testing.T) {
	t.Parallel()
	provider := &scriptedProvider{streams: [][]StreamEvent{
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "bad-shape", Name: "build_instance_search_link", Arguments: `{"where":{"category":"raid"}}`}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "bad-scope", Name: "build_instance_search_link", Arguments: `{"where":{"field":"player.class","op":"=","value":"DRUID"}}`}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
		{{Type: StreamEventToolCallDelta, ToolCall: ToolCallDelta{Index: 0, ID: "corrected", Name: "build_instance_search_link", Arguments: `{"where":{"and":[{"field":"instance.category","op":"=","value":"raid"},{"any_player":{"field":"player.class","op":"=","value":"DRUID"}}]}}`}}, {Type: StreamEventFinish, FinishReason: FinishReasonToolCalls}},
		{{Type: StreamEventTextDelta, Text: "Here is your link."}, {Type: StreamEventFinish, FinishReason: FinishReasonStop}},
	}}
	var stream strings.Builder
	var persisted []Message
	_, err := (&Service{}).agentLoop(context.Background(), agui.NewStreamWriter(&stream, nil), provider, nil, "model", assistants["site-help"], []Message{{Role: RoleUser, Content: "find a raid with a druid"}}, toolContext{}, debugRunContext{Enabled: true}, nil, agentLoopState{}, func(messages ...Message) error { persisted = append(persisted, messages...); return nil }, nil, nil)
	require.NoError(t, err)
	require.Equal(t, 4, provider.calls)
	require.Contains(t, persisted[1].Content, "invalid_search_query")
	require.Contains(t, persisted[1].Content, "field")
	require.Contains(t, persisted[3].Content, "any_player")
	require.Contains(t, persisted[5].Content, "/search?q=")
	snapshots := debugSnapshots(t, stream.String())
	require.Equal(t, "tool_results", snapshots[1].Phase)
	require.Equal(t, "build_instance_search_link", snapshots[1].Messages[3].Name)
	require.Contains(t, snapshots[1].Messages[3].Content, "invalid_search_query")
}

func TestSearchLinkValidationFeedbackIsBoundedAndDoesNotEchoParserDetails(t *testing.T) {
	t.Parallel()
	output, err := searchLinkValidationResult(&instancesearch.Error{Path: "where.field", Message: strings.Repeat("x", 2000)})
	require.NoError(t, err)
	require.Less(t, len(output), 650)
	require.Contains(t, output, "where.field")
	output, err = searchLinkValidationResult(fmt.Errorf("private parser detail: %s", strings.Repeat("secret", 100)))
	require.NoError(t, err)
	require.NotContains(t, output, "private parser detail")
	require.NotContains(t, output, "secret")
}

func TestBuildInstanceSearchLinkRejectsExcessiveDepth(t *testing.T) {
	t.Parallel()
	where := `{"field":"instance.name","op":"=","value":"Naxxramas"}`
	for range instancesearch.DefaultMaxDepth {
		where = `{"not":` + where + `}`
	}
	_, err := (&Service{}).executeTool(context.Background(), toolContext{}, "build_instance_search_link", `{"where":`+where+`}`)
	require.Error(t, err)
}
