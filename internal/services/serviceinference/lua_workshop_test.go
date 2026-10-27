package serviceinference

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestLuaWorkshopIsDurableAndUsesOnlyLuaEditorTools(t *testing.T) {
	t.Parallel()
	a := assistants["lua-workshop"]
	require.True(t, a.Durable)
	require.Equal(t, "lua_project", a.ContextType)
	require.Empty(t, a.Tools)

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
	require.Equal(t, []string{"read_lua_files", "edit_lua_file", "run_startup_check"}, names)
	_, ok := clientToolByName("lua-editor", "update_instance_ui")
	require.False(t, ok, "instance tools must not resolve under the Lua capability")

	_, err = advertisedClient(&chroniclesdk.InferenceClient{SessionID: "session-1", Capabilities: []chroniclesdk.InferenceClientCapability{
		{ID: "lua-editor", Version: 1, ScopeType: "lua_project", ScopeID: "other"},
	}}, luaEditorCapability, "project-1")
	require.ErrorContains(t, err, "must match")
}

func TestLuaEditorToolArguments(t *testing.T) {
	t.Parallel()
	for _, args := range []string{
		`{"file":"main.lua","expected_revision":3,"edits":[{"old_text":"return {}","new_text":"return { ok = true }"}]}`,
		`{"file":"project.json","expected_revision":0,"content":"{}"}`,
	} {
		_, err := validateClientToolArguments("edit_lua_file", args)
		require.NoError(t, err, args)
	}
	for _, args := range []string{
		`{"file":"main.lua","edits":[{"old_text":"a","new_text":"b"}]}`,
		`{"file":"other.lua","expected_revision":1,"content":"x"}`,
		`{"file":"main.lua","expected_revision":1}`,
		`{"file":"main.lua","expected_revision":1,"content":"x","edits":[{"old_text":"a","new_text":"b"}]}`,
		`{"file":"main.lua","expected_revision":1,"edits":[{"old_text":"","new_text":"b"}]}`,
	} {
		_, err := validateClientToolArguments("edit_lua_file", args)
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

func TestLuaWorkshopPromptIncludesAPIReference(t *testing.T) {
	t.Parallel()
	system := assistants["lua-workshop"].System
	for _, want := range []string{"# Addon API reference", "## Events", "Chronicle.GetUnit", "## Limits", "chronicle.v1.ui"} {
		require.Contains(t, system, want)
	}
}
