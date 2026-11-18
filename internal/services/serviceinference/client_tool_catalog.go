package serviceinference

import (
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

// The API mount authenticates and checks use_inference_chat for both endpoints.
// Neither endpoint accesses browser state, executes tools, or uses a provider.
func (s *Service) listClientTools(w http.ResponseWriter, r *http.Request) {
	tools := make([]chroniclesdk.InferenceBrowserTool, 0)
	for _, capability := range clientCapabilities {
		for _, tool := range capability.Tools {
			tools = append(tools, chroniclesdk.InferenceBrowserTool{
				Name: tool.Name, Description: tool.Description, InputSchema: tool.Parameters,
				CapabilityID: tool.CapabilityID, CapabilityVersion: tool.CapabilityVersion,
				Effect: tool.Effect, Confirmation: tool.Confirmation,
			})
		}
	}
	slices.SortFunc(tools, func(a, b chroniclesdk.InferenceBrowserTool) int {
		if order := strings.Compare(a.CapabilityID, b.CapabilityID); order != 0 {
			return order
		}
		return strings.Compare(a.Name, b.Name)
	})
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceClientToolsResponse{Tools: tools})
}

func (s *Service) validateClientTool(w http.ResponseWriter, r *http.Request) {
	// Allow envelope overhead in addition to the existing argument bound. Errors
	// are deliberately generic: never echo caller-controlled JSON or schema errors.
	r.Body = http.MaxBytesReader(w, r.Body, maxToolArguments+4096)
	var request chroniclesdk.InferenceValidateClientToolRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	reject := func() {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid client tool request or arguments."})
	}
	if err := decoder.Decode(&request); err != nil {
		reject()
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		reject()
		return
	}
	tool, ok := clientToolByName(request.CapabilityID, request.Name)
	if !ok || request.CapabilityVersion != tool.CapabilityVersion {
		reject()
		return
	}
	// Every canonical tool takes an object, including no-argument tools.
	if raw := strings.TrimSpace(string(request.Arguments)); !strings.HasPrefix(raw, "{") {
		reject()
		return
	}
	arguments, err := validateClientToolArguments(request.Name, string(request.Arguments))
	if err != nil {
		reject()
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.InferenceValidateClientToolResponse{Arguments: arguments})
}
