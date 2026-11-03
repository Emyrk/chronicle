package serviceinference

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/internal/instancesearch"
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

func TestBuildInstanceSearchLinkRejectsExcessiveDepth(t *testing.T) {
	t.Parallel()
	where := `{"field":"instance.name","op":"=","value":"Naxxramas"}`
	for range instancesearch.DefaultMaxDepth {
		where = `{"not":` + where + `}`
	}
	_, err := (&Service{}).executeTool(context.Background(), toolContext{}, "build_instance_search_link", `{"where":`+where+`}`)
	require.Error(t, err)
}
