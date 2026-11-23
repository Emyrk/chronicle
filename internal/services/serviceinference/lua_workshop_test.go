package serviceinference

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestLuaWorkshopIsDurableAndUsesScopedTools(t *testing.T) {
	t.Parallel()
	a := assistants[addonWorkshopPanelAssistantID]
	require.True(t, a.Durable)
	require.Equal(t, "lua_project", a.ContextType)
	require.Equal(t, []ToolDefinition{luaReferenceReadTool}, a.Tools)
	require.Equal(t, webResearchTools, a.ServerTools)

	capability, err := advertisedClient(&chroniclesdk.InferenceClient{SessionID: "session-1", Capabilities: []chroniclesdk.InferenceClientCapability{
		{ID: "instance-page", Version: 2, ScopeType: "instance", ScopeID: "instance-1"},
		{ID: "lua-editor", Version: 1, ScopeType: "lua_project", ScopeID: "project-1"},
	}}, clientCapabilities[a.ClientCapability], "project-1")
	require.NoError(t, err)
	require.Equal(t, "lua-editor", capability.ID)

	names := []string{}
	for _, tool := range withClientTools(a, capability).Tools {
		require.True(t, json.Valid(tool.Parameters), tool.Name)
		names = append(names, tool.Name)
	}
	require.Equal(t, []string{"read_skill", "read_lua_files", "edit_lua_file", "save_lua_files", "run_preview", "control_preview_replay", "run_startup_check"}, names)
	_, ok := clientToolByName("lua-editor", "update_instance_ui")
	require.False(t, ok, "instance tools must not resolve under the Lua capability")

	_, err = advertisedClient(&chroniclesdk.InferenceClient{SessionID: "session-1", Capabilities: []chroniclesdk.InferenceClientCapability{
		{ID: "lua-editor", Version: 1, ScopeType: "lua_project", ScopeID: "other"},
	}}, luaEditorCapability, "project-1")
	require.ErrorContains(t, err, "must match")
}

func TestLuaEditorToolArguments(t *testing.T) {
	t.Parallel()
	edit, ok := clientToolByName("lua-editor", "edit_lua_file")
	require.True(t, ok)
	var schema struct {
		Properties struct {
			File struct {
				Pattern string `json:"pattern"`
			} `json:"file"`
		} `json:"properties"`
	}
	require.NoError(t, json.Unmarshal(edit.Parameters, &schema))
	require.Equal(t, luaEditorFilePattern.String(), schema.Properties.File.Pattern, "the advertised schema and the server check must agree")
	for _, args := range []string{
		`{"file":"main.lua","expected_revision":3,"edits":[{"old_text":"return {}","new_text":"return { ok = true }"}]}`,
		`{"file":"project.json","expected_revision":0,"content":"{}"}`,
		`{"file":"README.md","expected_revision":2,"content":"# Panel"}`,
		`{"file":"ui/bars.lua","expected_revision":2,"content":"return {}"}`,
		`{"file":"lib/util.v2.lua","expected_revision":2,"content":"return {}"}`,
	} {
		_, err := validateClientToolArguments("edit_lua_file", args)
		require.NoError(t, err, args)
	}
	for _, args := range []string{
		`{"file":"main.lua","edits":[{"old_text":"a","new_text":"b"}]}`,
		`{"file":"notes.txt","expected_revision":1,"content":"x"}`,
		`{"file":"../main.lua","expected_revision":1,"content":"x"}`,
		`{"file":"ui/../main.lua","expected_revision":1,"content":"x"}`,
		`{"file":"/main.lua","expected_revision":1,"content":"x"}`,
		`{"file":"ui\\main.lua","expected_revision":1,"content":"x"}`,
		`{"file":"docs/README.md","expected_revision":1,"content":"x"}`,
		`{"file":".lua","expected_revision":1,"content":"x"}`,
		`{"file":"main.lua","expected_revision":1}`,
		`{"file":"main.lua","expected_revision":1,"content":"x","edits":[{"old_text":"a","new_text":"b"}]}`,
		`{"file":"main.lua","expected_revision":1,"edits":[{"old_text":"","new_text":"b"}]}`,
	} {
		_, err := validateClientToolArguments("edit_lua_file", args)
		require.Error(t, err, args)
	}
	for _, args := range []string{`{}`, `{"encounter_ids":["e1","e2"]}`, `{"replay_ms":0}`, `{"encounter_ids":["e1"],"replay_ms":61500}`} {
		_, err := validateClientToolArguments("run_preview", args)
		require.NoError(t, err, args)
	}
	for _, args := range []string{`{"encounter_ids":[]}`, `{"encounter_ids":["e1","e1"]}`, `{"encounter_ids":[""]}`, `{"encounter_ids":"e1"}`, `{"instance_id":"x"}`, `{"replay_ms":-1}`, `{"replay_ms":"1"}`} {
		_, err := validateClientToolArguments("run_preview", args)
		require.Error(t, err, args)
	}
	for _, args := range []string{`{}`, `{"enabled":true}`, `{"enabled":true,"position_ms":30000,"playing":true,"speed":2}`, `{"speed":0.5}`} {
		_, err := validateClientToolArguments("control_preview_replay", args)
		require.NoError(t, err, args)
	}
	for _, args := range []string{`{"position_ms":-1}`, `{"speed":3}`, `{"enabled":"yes"}`, `{"seek":1}`} {
		_, err := validateClientToolArguments("control_preview_replay", args)
		require.Error(t, err, args)
	}
	_, err := validateClientToolArguments("read_lua_files", `{"file":"main.lua"}`)
	require.Error(t, err)
}

func TestLuaEditorContinuationIsBoundToProjectScope(t *testing.T) {
	t.Parallel()
	pending := database.InferenceClientToolRequest{Status: "pending", ClientSessionID: "s", CapabilityID: "lua-editor", CapabilityVersion: 1,
		ScopeType: pgtype.Text{String: "lua_project", Valid: true}, ScopeID: pgtype.Text{String: "project-1", Valid: true}, Effect: "view_mutation"}
	request := chroniclesdk.InferenceClientToolResultRequest{ClientSessionID: "s", CapabilityID: "lua-editor", CapabilityVersion: 1, ScopeType: "lua_project", ScopeID: "project-1", Status: "success"}
	require.NoError(t, validateClientToolContinuation(pending, request, "project-1"))
	require.ErrorIs(t, validateClientToolContinuation(pending, request, "project-2"), errClientToolMismatch)
}

func TestLuaWorkshopPromptIncludesCollapsedAPIReference(t *testing.T) {
	t.Parallel()
	system := assistants[addonWorkshopPanelAssistantID].System
	for _, want := range []string{"# Module API reference", "## Events", "read_skill", "## Limits", "lua-module-api-units"} {
		require.Contains(t, system, want)
	}
}
