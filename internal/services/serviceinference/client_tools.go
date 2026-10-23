package serviceinference

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
)

const (
	instancePageCapabilityID      = "instance-page"
	instancePageCapabilityVersion = 1
	maxClientCapabilities         = 8
	maxClientSessionID            = 128
	maxClientResult               = 64 << 10
)

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
		ToolDefinition: ToolDefinition{Name: "inspect_instance_ui", Description: "Inspect the current authorized instance page UI selection, layout, panels, and available capabilities.", Parameters: json.RawMessage(`{"type":"object","properties":{"include":{"type":"array","items":{"type":"string","enum":["selection","layout","panels","capabilities"]},"maxItems":4}},"additionalProperties":false}`)},
		CapabilityID:   instancePageCapabilityID, CapabilityVersion: instancePageCapabilityVersion, Effect: "read", Confirmation: "never",
	},
	{
		ToolDefinition: ToolDefinition{Name: "query_panel", Description: "Query bounded data from a panel on the current authorized instance page.", Parameters: json.RawMessage(`{"type":"object","properties":{"panel_id":{"type":"string"},"view":{"type":"string","enum":["summary","top_entities"],"default":"top_entities"},"limit":{"type":"integer","minimum":1,"maximum":50}},"required":["panel_id"],"additionalProperties":false}`)},
		CapabilityID:   instancePageCapabilityID, CapabilityVersion: instancePageCapabilityVersion, Effect: "read", Confirmation: "never",
	},
	{
		ToolDefinition: ToolDefinition{Name: "update_instance_ui", Description: "Apply bounded view mutations to the current authorized instance page.", Parameters: json.RawMessage(`{"type":"object","properties":{"expected_revision":{"type":"integer","minimum":0},"operations":{"type":"array","minItems":1,"maxItems":20,"items":{"type":"object","properties":{"op":{"type":"string","enum":["apply_preset","set_panel","set_panel_option","set_panel_filters","select_encounters","select_players","select_enemies","set_time_range","clear_time_range"]},"preset_id":{"type":"string"},"panel_id":{"type":"string"},"panel_type":{"type":"string"},"option":{"type":["string","null"]},"filters":{"type":"array","maxItems":20},"ids":{"type":"array","items":{"type":"string"},"maxItems":100},"start_offset_ms":{"type":"integer","minimum":0},"end_offset_ms":{"type":"integer","minimum":0}},"required":["op"],"additionalProperties":false}}},"required":["operations"],"additionalProperties":false}`)},
		CapabilityID:   instancePageCapabilityID, CapabilityVersion: instancePageCapabilityVersion, Effect: "view_mutation", Confirmation: "unless_yolo",
	},
}

func clientToolByName(name string) (clientToolDefinition, bool) {
	for _, tool := range instancePageClientTools {
		if tool.Name == name {
			return tool, true
		}
	}
	return clientToolDefinition{}, false
}

func advertisedInstancePageClient(client *chroniclesdk.InferenceClient, instanceID string) (*clientCapability, error) {
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
		if capability.ID != instancePageCapabilityID || capability.Version != instancePageCapabilityVersion {
			continue
		}
		if capability.ScopeType != "instance" || capability.ScopeID != instanceID || matched != nil {
			return nil, errors.New("instance-page capability must match the thread instance")
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
	for _, tool := range instancePageClientTools {
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
	default:
		return nil, fmt.Errorf("unknown client tool %q", name)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, []byte(raw)); err != nil {
		return nil, errors.New("invalid tool arguments")
	}
	return compact.Bytes(), nil
}

func validateClientToolContinuation(pending database.InferenceClientToolRequest, request chroniclesdk.InferenceClientToolResultRequest, instanceID string) error {
	if pending.Status != "pending" || pending.ClientSessionID != request.ClientSessionID || pending.CapabilityID != request.CapabilityID || pending.CapabilityVersion != int32(request.CapabilityVersion) || pending.ScopeType.String != request.ScopeType || pending.ScopeID.String != request.ScopeID {
		return errClientToolMismatch
	}
	if pending.ScopeType.String != "instance" || pending.ScopeID.String != instanceID {
		return errClientToolMismatch
	}
	if pending.StateRevision.Valid {
		if request.StateRevision == nil || (pending.Effect == "read" && *request.StateRevision != pending.StateRevision.Int64) || (pending.Effect == "view_mutation" && *request.StateRevision < pending.StateRevision.Int64) {
			return errClientToolMismatch
		}
	}
	return nil
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
		payload = nil
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
