package serviceinference

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
)

const (
	instancePageCapabilityID      = "instance-page"
	instancePageCapabilityVersion = 2
	luaEditorCapabilityID         = "lua-editor"
	luaEditorCapabilityVersion    = 1
	maxLuaEditorEdits             = 20
	maxClientCapabilities         = 8
	maxClientSessionID            = 128
	maxClientResult               = 64 << 10
)

var clientLayoutItemIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)

// luaEditorFilePattern is the files edit_lua_file may name: the manifest, the README, or any relative
// .lua path (directories allowed, no dot segments). The browser decides which files actually exist.
var luaEditorFilePattern = regexp.MustCompile(`^(?:project\.json|README\.md|(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.lua)$`)

const maxLuaEditorPathBytes = 200

type clientCapability struct {
	ID            string
	Version       int
	ScopeType     string
	ScopeID       string
	SessionID     string
	StateRevision *int64
}

type clientToolDefinition struct {
	ToolDefinition
	CapabilityID      string
	CapabilityVersion int
	Effect            string
	Confirmation      string
}

var instancePageClientTools = []clientToolDefinition{
	{
		ToolDefinition: ToolDefinition{Name: "inspect_instance_ui", Description: "Inspect the current authorized instance page UI selection, layout, panels, and available capabilities. The capabilities section includes every panel type with its human label, purpose, visibility, and whether query_panel supports it.", Parameters: json.RawMessage(`{"type":"object","properties":{"include":{"type":"array","items":{"type":"string","enum":["selection","layout","panels","capabilities"]},"maxItems":4}},"additionalProperties":false}`)},
		CapabilityID:   instancePageCapabilityID, CapabilityVersion: instancePageCapabilityVersion, Effect: "read", Confirmation: "never",
	},
	{
		ToolDefinition: ToolDefinition{Name: "query_panel", Description: "Query bounded data from a panel on the current authorized instance page.", Parameters: json.RawMessage(`{"type":"object","properties":{"panel_id":{"type":"string"},"view":{"type":"string","enum":["summary","top_entities"],"default":"top_entities"},"limit":{"type":"integer","minimum":1,"maximum":50}},"required":["panel_id"],"additionalProperties":false}`)},
		CapabilityID:   instancePageCapabilityID, CapabilityVersion: instancePageCapabilityVersion, Effect: "read", Confirmation: "never",
	},
	{
		ToolDefinition: ToolDefinition{Name: "update_instance_layout", Description: "Atomically edit the current authorized instance layout with explicit panel, strip, and group operations. Use IDs, panel types, strip types, and geometry from inspect_instance_ui. Installed custom panels are valid panel types. Nested groups, overlapping geometry, and fit changes are not supported. If the result is user_rejected or capability_unavailable, do not retry. After stale_state, inspect fresh UI state before retrying once.", Parameters: json.RawMessage(`{"type":"object","properties":{"expected_revision":{"type":"integer","minimum":0},"operations":{"type":"array","minItems":1,"maxItems":20,"items":{"type":"object","properties":{"op":{"type":"string","enum":["add_panel","add_strip","remove_item","move_item","resize_item","add_group","update_group","move_into_group","move_out_of_group","set_appearance"]},"item_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"},"panel_type":{"type":"string","minLength":1,"maxLength":200},"strip_type":{"type":"string","minLength":1,"maxLength":100},"orientation":{"type":"string","enum":["horizontal","vertical"]},"group_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"},"title":{"type":"string","maxLength":100},"description":{"type":"string","maxLength":500},"accent_color":{"type":["string","null"],"maxLength":100},"collapsed_by_default":{"type":"boolean"},"x":{"type":"integer","minimum":0,"maximum":11},"y":{"type":"integer","minimum":0},"w":{"type":"integer","minimum":1,"maximum":12},"h":{"type":"integer","minimum":1,"maximum":100},"seamless":{"type":"boolean"}},"required":["op"],"additionalProperties":false}}},"required":["operations"],"additionalProperties":false}`)},
		CapabilityID:   instancePageCapabilityID, CapabilityVersion: instancePageCapabilityVersion, Effect: "view_mutation", Confirmation: "unless_yolo",
	},
	{
		ToolDefinition: ToolDefinition{Name: "update_instance_ui", Description: "Apply bounded view mutations to the current authorized instance page. If the result is user_rejected or capability_unavailable, do not retry the same mutation. After stale_state, inspect fresh UI state before retrying once.", Parameters: json.RawMessage(`{"type":"object","properties":{"expected_revision":{"type":"integer","minimum":0},"operations":{"type":"array","minItems":1,"maxItems":20,"items":{"type":"object","properties":{"op":{"type":"string","enum":["apply_preset","set_panel","set_panel_option","set_panel_filters","select_encounters","select_players","select_enemies","set_time_range","clear_time_range"]},"preset_id":{"type":"string"},"panel_id":{"type":"string"},"panel_type":{"type":"string"},"option":{"type":["string","null"]},"filters":{"type":"array","maxItems":20},"ids":{"type":"array","items":{"type":"string"},"maxItems":100},"start_offset_ms":{"type":"integer","minimum":0},"end_offset_ms":{"type":"integer","minimum":0}},"required":["op"],"additionalProperties":false}}},"required":["operations"],"additionalProperties":false}`)},
		CapabilityID:   instancePageCapabilityID, CapabilityVersion: instancePageCapabilityVersion, Effect: "view_mutation", Confirmation: "unless_yolo",
	},
}

// luaEditorClientTools operate on the unsaved browser working copy only. The
// server never reads or writes Lua drafts on the assistant's behalf.
var luaEditorClientTools = []clientToolDefinition{
	{
		ToolDefinition: ToolDefinition{Name: "read_lua_files", Description: "Read the current unsaved working copy: every file by path (project.json, README.md and the .lua files, e.g. main.lua), the working-copy revision, and any validation error.", Parameters: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)},
		CapabilityID:   luaEditorCapabilityID, CapabilityVersion: luaEditorCapabilityVersion, Effect: "read", Confirmation: "never",
	},
	{
		ToolDefinition: ToolDefinition{Name: "edit_lua_file", Description: "Edit one file in the unsaved working copy: project.json, README.md (Markdown shown on the addon's page) or a .lua file returned by read_lua_files. Provide either edits (each old_text must appear exactly once in the current file) or content to replace the whole file. Pass expected_revision from read_lua_files; after stale_state, read again before retrying once. Edits are never saved or published; the user saves explicitly.", Parameters: json.RawMessage(`{"type":"object","properties":{"file":{"type":"string","maxLength":200,"pattern":"^(?:project\\.json|README\\.md|(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.lua)$"},"expected_revision":{"type":"integer","minimum":0},"edits":{"type":"array","minItems":1,"maxItems":20,"items":{"type":"object","properties":{"old_text":{"type":"string","minLength":1},"new_text":{"type":"string"}},"required":["old_text","new_text"],"additionalProperties":false}},"content":{"type":"string","minLength":1}},"required":["file","expected_revision"],"additionalProperties":false}`)},
		CapabilityID:   luaEditorCapabilityID, CapabilityVersion: luaEditorCapabilityVersion, Effect: "view_mutation", Confirmation: "never",
	},
	{
		ToolDefinition: ToolDefinition{Name: "run_preview", Description: "Replay the current unsaved working copy in a fresh sandboxed browser worker against the instance the user picked in the Preview pane, exactly like the preview. Pass encounter_ids to choose encounters (this also selects them in the user's Preview pane); omit it to use the user's current selection. Every result lists the instance's encounters (id, name, boss, kill_type, selected) so you can choose. Returns ok, the panel's error message if it stopped, event and timing metrics, and an indented text outline of every UI object it drew (kind, id, text, size, position, colors, hidden). If it reports that an instance must be selected first, ask the user to pick one in the Preview pane.", Parameters: json.RawMessage(`{"type":"object","properties":{"encounter_ids":{"type":"array","minItems":1,"maxItems":100,"uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":200}}},"additionalProperties":false}`)},
		CapabilityID:   luaEditorCapabilityID, CapabilityVersion: luaEditorCapabilityVersion, Effect: "read", Confirmation: "never",
	},
	{
		ToolDefinition: ToolDefinition{Name: "run_startup_check", Description: "Start the current unsaved working copy in a fresh sandboxed browser worker and report whether Lua startup succeeded or the Lua error. No events are processed.", Parameters: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)},
		CapabilityID:   luaEditorCapabilityID, CapabilityVersion: luaEditorCapabilityVersion, Effect: "read", Confirmation: "never",
	},
}

type clientCapabilityDefinition struct {
	ID        string
	Version   int
	ScopeType string
	Tools     []clientToolDefinition
}

var (
	instancePageCapability = clientCapabilityDefinition{ID: instancePageCapabilityID, Version: instancePageCapabilityVersion, ScopeType: "instance", Tools: instancePageClientTools}
	luaEditorCapability    = clientCapabilityDefinition{ID: luaEditorCapabilityID, Version: luaEditorCapabilityVersion, ScopeType: "lua_project", Tools: luaEditorClientTools}
	clientCapabilities     = map[string]clientCapabilityDefinition{instancePageCapabilityID: instancePageCapability, luaEditorCapabilityID: luaEditorCapability}
)

func clientToolByName(capabilityID, name string) (clientToolDefinition, bool) {
	for _, tool := range clientCapabilities[capabilityID].Tools {
		if tool.Name == name {
			return tool, true
		}
	}
	return clientToolDefinition{}, false
}

func advertisedInstancePageClient(client *chroniclesdk.InferenceClient, instanceID string) (*clientCapability, error) {
	return advertisedClient(client, instancePageCapability, instanceID)
}

// advertisedClient returns the browser capability matching definition and the
// thread scope. Unknown or older capability versions are ignored.
func advertisedClient(client *chroniclesdk.InferenceClient, definition clientCapabilityDefinition, scopeID string) (*clientCapability, error) {
	if client == nil {
		return nil, nil
	}
	if client.SessionID == "" || len(client.SessionID) > maxClientSessionID || len(client.Capabilities) > maxClientCapabilities {
		return nil, errors.New("invalid client capabilities")
	}
	var matched *clientCapability
	for _, capability := range client.Capabilities {
		if capability.ID == "" || len(capability.ID) > 64 || capability.Version < 1 || len(capability.ScopeType) > 32 || len(capability.ScopeID) > 128 {
			return nil, errors.New("invalid client capability")
		}
		if (capability.ScopeType == "") != (capability.ScopeID == "") || (capability.StateRevision != nil && *capability.StateRevision < 0) {
			return nil, errors.New("invalid client capability scope")
		}
		if capability.ID != definition.ID || capability.Version != definition.Version {
			continue
		}
		if capability.ScopeType != definition.ScopeType || capability.ScopeID != scopeID || matched != nil {
			return nil, fmt.Errorf("%s capability must match the thread %s", definition.ID, definition.ScopeType)
		}
		matched = &clientCapability{ID: capability.ID, Version: capability.Version, ScopeType: capability.ScopeType, ScopeID: capability.ScopeID, SessionID: client.SessionID, StateRevision: capability.StateRevision}
	}
	return matched, nil
}

func withClientTools(a assistant, capability *clientCapability) assistant {
	if capability == nil {
		return a
	}
	a.Tools = slices.Clone(a.Tools)
	for _, tool := range clientCapabilities[capability.ID].Tools {
		a.Tools = append(a.Tools, tool.ToolDefinition)
	}
	return a
}

func validateClientToolArguments(name, raw string) (json.RawMessage, error) {
	if len(raw) > maxToolArguments {
		return nil, errors.New("tool arguments too large")
	}
	switch name {
	case "inspect_instance_ui":
		var input struct {
			Include []string `json:"include"`
		}
		if err := decodeStrict(raw, &input); err != nil || len(input.Include) > 4 {
			return nil, errors.New("invalid inspect_instance_ui arguments")
		}
		allowed := map[string]bool{"selection": true, "layout": true, "panels": true, "capabilities": true}
		for _, value := range input.Include {
			if !allowed[value] {
				return nil, errors.New("invalid inspect_instance_ui include")
			}
		}
	case "query_panel":
		var input struct {
			PanelID string `json:"panel_id"`
			View    string `json:"view"`
			Limit   int    `json:"limit"`
		}
		if err := decodeStrict(raw, &input); err != nil || strings.TrimSpace(input.PanelID) == "" || len(input.PanelID) > 200 {
			return nil, errors.New("invalid query_panel arguments")
		}
		if input.View != "" && input.View != "summary" && input.View != "top_entities" {
			return nil, errors.New("invalid query_panel view")
		}
		if input.Limit < 0 || input.Limit > 50 {
			return nil, errors.New("invalid query_panel limit")
		}
	case "update_instance_layout":
		var input struct {
			ExpectedRevision *int64            `json:"expected_revision"`
			Operations       []json.RawMessage `json:"operations"`
		}
		if err := decodeStrict(raw, &input); err != nil || len(input.Operations) < 1 || len(input.Operations) > 20 || (input.ExpectedRevision != nil && *input.ExpectedRevision < 0) {
			return nil, errors.New("invalid update_instance_layout arguments")
		}
		allowedOps := map[string]bool{"add_panel": true, "add_strip": true, "remove_item": true, "move_item": true, "resize_item": true, "add_group": true, "update_group": true, "move_into_group": true, "move_out_of_group": true, "set_appearance": true}
		validID := clientLayoutItemIDPattern.MatchString
		validCoordinate := func(value *int64) bool { return value != nil && *value >= 0 }
		validWidth := func(value *int64) bool { return value != nil && *value >= 1 && *value <= 12 }
		validHeight := func(value *int64) bool { return value != nil && *value >= 1 && *value <= 100 }
		for _, rawOperation := range input.Operations {
			var operation struct {
				Op                 string          `json:"op"`
				ItemID             string          `json:"item_id"`
				PanelType          string          `json:"panel_type"`
				StripType          string          `json:"strip_type"`
				Orientation        string          `json:"orientation"`
				GroupID            string          `json:"group_id"`
				Title              *string         `json:"title"`
				Description        *string         `json:"description"`
				AccentColor        json.RawMessage `json:"accent_color"`
				CollapsedByDefault *bool           `json:"collapsed_by_default"`
				X                  *int64          `json:"x"`
				Y                  *int64          `json:"y"`
				W                  *int64          `json:"w"`
				H                  *int64          `json:"h"`
				Seamless           *bool           `json:"seamless"`
			}
			if err := decodeStrict(string(rawOperation), &operation); err != nil || !allowedOps[operation.Op] || len(operation.PanelType) > 200 || len(operation.StripType) > 100 || (operation.Orientation != "" && operation.Orientation != "horizontal" && operation.Orientation != "vertical") || (operation.Title != nil && len(*operation.Title) > 100) || (operation.Description != nil && len(*operation.Description) > 500) {
				return nil, errors.New("invalid update_instance_layout operation")
			}
			var operationFields map[string]json.RawMessage
			if json.Unmarshal(rawOperation, &operationFields) != nil || string(operationFields["title"]) == "null" || string(operationFields["description"]) == "null" {
				return nil, errors.New("invalid update_instance_layout text")
			}
			if len(operation.AccentColor) > 0 && string(operation.AccentColor) != "null" {
				var accentColor string
				if json.Unmarshal(operation.AccentColor, &accentColor) != nil || len(accentColor) > 100 {
					return nil, errors.New("invalid update_instance_layout accent color")
				}
			}
			switch operation.Op {
			case "add_panel":
				if !validID(operation.ItemID) || strings.TrimSpace(operation.PanelType) == "" || !validCoordinate(operation.X) || operation.X == nil || *operation.X > 11 || !validCoordinate(operation.Y) || !validWidth(operation.W) || !validHeight(operation.H) || *operation.X+*operation.W > 12 {
					return nil, errors.New("invalid add_panel operation")
				}
			case "add_strip":
				if !validID(operation.ItemID) || strings.TrimSpace(operation.StripType) == "" || !validCoordinate(operation.X) || operation.X == nil || *operation.X > 11 || !validCoordinate(operation.Y) || (operation.W != nil && !validWidth(operation.W)) || (operation.H != nil && !validHeight(operation.H)) || (operation.W != nil && *operation.X+*operation.W > 12) {
					return nil, errors.New("invalid add_strip operation")
				}
			case "remove_item":
				if !validID(operation.ItemID) {
					return nil, errors.New("invalid remove_item operation")
				}
			case "move_item", "move_out_of_group":
				if !validID(operation.ItemID) || !validCoordinate(operation.X) || operation.X == nil || *operation.X > 11 || !validCoordinate(operation.Y) {
					return nil, errors.New("invalid move operation")
				}
			case "resize_item":
				if !validID(operation.ItemID) || !validWidth(operation.W) || !validHeight(operation.H) {
					return nil, errors.New("invalid resize_item operation")
				}
			case "add_group":
				if !validID(operation.ItemID) || operation.Title == nil || strings.TrimSpace(*operation.Title) == "" || !validCoordinate(operation.X) || *operation.X != 0 || !validCoordinate(operation.Y) {
					return nil, errors.New("invalid add_group operation")
				}
			case "update_group":
				if !validID(operation.ItemID) || (operation.Title == nil && operation.Description == nil && len(operation.AccentColor) == 0 && operation.CollapsedByDefault == nil) {
					return nil, errors.New("invalid update_group operation")
				}
			case "move_into_group":
				if !validID(operation.ItemID) || !validID(operation.GroupID) || !validCoordinate(operation.X) || operation.X == nil || *operation.X > 11 || !validCoordinate(operation.Y) {
					return nil, errors.New("invalid move_into_group operation")
				}
			case "set_appearance":
				if operation.Seamless == nil {
					return nil, errors.New("invalid set_appearance operation")
				}
			}
		}
	case "update_instance_ui":
		var input struct {
			ExpectedRevision *int64            `json:"expected_revision"`
			Operations       []json.RawMessage `json:"operations"`
		}
		if err := decodeStrict(raw, &input); err != nil || len(input.Operations) < 1 || len(input.Operations) > 20 || (input.ExpectedRevision != nil && *input.ExpectedRevision < 0) {
			return nil, errors.New("invalid update_instance_ui arguments")
		}
		allowedOps := map[string]bool{"apply_preset": true, "set_panel": true, "set_panel_option": true, "set_panel_filters": true, "select_encounters": true, "select_players": true, "select_enemies": true, "set_time_range": true, "clear_time_range": true}
		for _, rawOperation := range input.Operations {
			var operation struct {
				Op            string            `json:"op"`
				PresetID      string            `json:"preset_id"`
				PanelID       string            `json:"panel_id"`
				PanelType     string            `json:"panel_type"`
				Option        *string           `json:"option"`
				Filters       []json.RawMessage `json:"filters"`
				IDs           []string          `json:"ids"`
				StartOffsetMS *int64            `json:"start_offset_ms"`
				EndOffsetMS   *int64            `json:"end_offset_ms"`
			}
			if err := decodeStrict(string(rawOperation), &operation); err != nil || !allowedOps[operation.Op] || len(operation.Filters) > 20 || len(operation.IDs) > 100 || len(operation.PresetID) > 200 || len(operation.PanelID) > 200 || len(operation.PanelType) > 200 || (operation.StartOffsetMS != nil && *operation.StartOffsetMS < 0) || (operation.EndOffsetMS != nil && *operation.EndOffsetMS < 0) {
				return nil, errors.New("invalid update_instance_ui operation")
			}
			for _, id := range operation.IDs {
				if id == "" || len(id) > 200 {
					return nil, errors.New("invalid update_instance_ui id")
				}
			}
		}
	case "run_preview":
		var input struct {
			EncounterIDs *[]string `json:"encounter_ids"`
		}
		if err := decodeStrict(raw, &input); err != nil {
			return nil, errors.New("invalid run_preview arguments")
		}
		if input.EncounterIDs != nil {
			ids := *input.EncounterIDs
			if len(ids) == 0 || len(ids) > 100 {
				return nil, errors.New("run_preview encounter_ids must have 1 to 100 entries")
			}
			seen := make(map[string]bool, len(ids))
			for _, id := range ids {
				if id == "" || len(id) > 200 || seen[id] {
					return nil, errors.New("invalid run_preview encounter id")
				}
				seen[id] = true
			}
		}
	case "read_lua_files", "run_startup_check":
		var input struct{}
		if err := decodeStrict(raw, &input); err != nil {
			return nil, fmt.Errorf("invalid %s arguments", name)
		}
	case "edit_lua_file":
		var input struct {
			File             string  `json:"file"`
			ExpectedRevision *int64  `json:"expected_revision"`
			Content          *string `json:"content"`
			Edits            []struct {
				OldText string `json:"old_text"`
				NewText string `json:"new_text"`
			} `json:"edits"`
		}
		if err := decodeStrict(raw, &input); err != nil || len(input.File) > maxLuaEditorPathBytes || !luaEditorFilePattern.MatchString(input.File) || input.ExpectedRevision == nil || *input.ExpectedRevision < 0 {
			return nil, errors.New("invalid edit_lua_file arguments")
		}
		// Total size is already bounded by maxToolArguments.
		if (input.Content == nil) == (len(input.Edits) == 0) || len(input.Edits) > maxLuaEditorEdits || (input.Content != nil && *input.Content == "") {
			return nil, errors.New("edit_lua_file requires either content or 1-20 edits")
		}
		for _, edit := range input.Edits {
			if edit.OldText == "" {
				return nil, errors.New("invalid edit_lua_file edit")
			}
		}
	default:
		return nil, fmt.Errorf("unknown client tool %q", name)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, []byte(raw)); err != nil {
		return nil, errors.New("invalid tool arguments")
	}
	return compact.Bytes(), nil
}

func validateClientToolContinuation(pending database.InferenceClientToolRequest, request chroniclesdk.InferenceClientToolResultRequest, scopeID string) error {
	if pending.Status != "pending" || pending.ClientSessionID != request.ClientSessionID || pending.CapabilityID != request.CapabilityID || pending.CapabilityVersion != int32(request.CapabilityVersion) || pending.ScopeType.String != request.ScopeType || pending.ScopeID.String != request.ScopeID {
		return errClientToolMismatch
	}
	definition, ok := clientCapabilities[pending.CapabilityID]
	if !ok || pending.ScopeType.String != definition.ScopeType || pending.ScopeID.String != scopeID {
		return errClientToolMismatch
	}
	if pending.StateRevision.Valid {
		if request.StateRevision == nil || (pending.Effect == "read" && *request.StateRevision != pending.StateRevision.Int64) || (pending.Effect == "view_mutation" && *request.StateRevision < pending.StateRevision.Int64) {
			return errClientToolMismatch
		}
	}
	return nil
}

func clientToolFailureMessage(request chroniclesdk.InferenceClientToolResultRequest) string {
	var failure struct {
		Message string `json:"message"`
	}
	if len(request.Result) == 0 || !json.Valid(request.Result) || json.Unmarshal(request.Result, &failure) != nil {
		return ""
	}
	failure.Message = strings.TrimSpace(failure.Message)
	if runes := []rune(failure.Message); len(runes) > 500 {
		failure.Message = string(runes[:500])
	}
	return failure.Message
}

func terminalClientToolFailureMessage(request chroniclesdk.InferenceClientToolResultRequest) (string, bool) {
	detail := clientToolFailureMessage(request)
	switch request.Status {
	case "user_rejected":
		return "I didn't make that change because you declined it.", true
	case "capability_unavailable":
		if detail != "" {
			return "I couldn't complete that request: " + detail, true
		}
		return "I couldn't complete that request because the required page capability is unavailable.", true
	case "client_error":
		if detail != "" {
			return "I couldn't complete that request: " + detail, true
		}
		return "I couldn't complete that request because the page tool failed. Refresh the page and try again.", true
	default:
		return "", false
	}
}

func normalizedClientToolResult(request chroniclesdk.InferenceClientToolResultRequest) (string, error) {
	if len(request.Result) > maxClientResult {
		return "", errors.New("client tool result too large")
	}
	var payload any
	switch request.Status {
	case "success":
		if len(request.Result) == 0 || !json.Valid(request.Result) {
			return "", errors.New("a valid JSON result is required")
		}
		if err := json.Unmarshal(request.Result, &payload); err != nil {
			return "", errors.New("invalid client tool result")
		}
	case "user_rejected", "capability_unavailable", "stale_state", "client_error":
		if message := clientToolFailureMessage(request); message != "" {
			payload = struct {
				Message string `json:"message"`
			}{Message: message}
		}
	default:
		return "", errors.New("invalid client tool status")
	}
	result := struct {
		Status        string `json:"status"`
		Result        any    `json:"result,omitempty"`
		StateRevision *int64 `json:"state_revision,omitempty"`
	}{Status: request.Status, Result: payload, StateRevision: request.StateRevision}
	return boundedJSON(result)
}
