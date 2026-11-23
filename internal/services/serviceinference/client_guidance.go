package serviceinference

import (
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/go-chi/chi/v5"
)

const luaModuleAPISkillID = "lua-module-api"
const clientGuidanceInstructions = "Call list_skill, then read_skill for relevant skills before working on this page. Browser approval is always enforced according to each tool's confirmation policy; external callers cannot bypass it. The UI assistant prompt may reference tools unavailable externally. Use only tools advertised by the active browser capability. This is static guidance, not access to conversation history or page data."

// Resolve only public, static assistant guidance. Never compose history, instance
// metadata, debug snapshots, or user settings into these provider-free responses.
func clientGuidanceAssistant(w http.ResponseWriter, r *http.Request) (assistant, bool) {
	id := "site-help"
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid page capability."})
		return assistant{}, false
	}
	values, supplied := query["capability_id"]
	if supplied {
		if len(values) != 1 {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid page capability."})
			return assistant{}, false
		}
		switch values[0] {
		case luaEditorCapabilityID:
			id = addonWorkshopPanelAssistantID
		case instancePageCapabilityID:
			id = "instance-analyst"
		case searchPageCapabilityID:
		default:
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid page capability."})
			return assistant{}, false
		}
	}
	a, err := withRuntimeSkills(assistants[id])
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Page guidance unavailable."})
		return assistant{}, false
	}
	return a, true
}

func clientGuidanceSkills(a assistant) []runtimeSkill {
	skills := debugRuntimeSkills(a)
	if a.ClientCapability == luaEditorCapabilityID {
		skills = append(skills, luaReferenceSkills...)
	}
	slices.SortFunc(skills, func(a, b runtimeSkill) int { return strings.Compare(a.ID, b.ID) })
	return skills
}

func clientGuidanceSkillSummaries(a assistant) []chroniclesdk.InferenceClientSkill {
	result := make([]chroniclesdk.InferenceClientSkill, 0)
	for _, skill := range clientGuidanceSkills(a) {
		result = append(result, chroniclesdk.InferenceClientSkill{ID: skill.ID, Name: skill.Name, Version: skill.Version})
	}
	return result
}

// Reserve space for the browser continuation envelope. Never silently truncate a
// canonical prompt or document if future additions exceed the transport budget.
func writeClientGuidance(w http.ResponseWriter, r *http.Request, response any) {
	encoded, err := json.Marshal(response)
	if err != nil || len(encoded) > maxClientResult-4096 {
		httpapi.Write(r.Context(), w, http.StatusInternalServerError, chroniclesdk.Response{Message: "Page guidance exceeds the response limit."})
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

func (s *Service) clientPageContext(w http.ResponseWriter, r *http.Request) {
	a, ok := clientGuidanceAssistant(w, r)
	if !ok {
		return
	}
	writeClientGuidance(w, r, chroniclesdk.InferenceClientPageContext{AssistantID: a.ID, AssistantName: a.Name, Prompt: a.System, Skills: clientGuidanceSkillSummaries(a), Instructions: clientGuidanceInstructions})
}

func (s *Service) listClientSkills(w http.ResponseWriter, r *http.Request) {
	a, ok := clientGuidanceAssistant(w, r)
	if !ok {
		return
	}
	writeClientGuidance(w, r, chroniclesdk.InferenceClientSkillsResponse{Skills: clientGuidanceSkillSummaries(a)})
}

func (s *Service) readClientSkill(w http.ResponseWriter, r *http.Request) {
	a, ok := clientGuidanceAssistant(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "skillID")
	for _, skill := range clientGuidanceSkills(a) {
		if skill.ID == id {
			writeClientGuidance(w, r, chroniclesdk.InferenceClientSkillResponse{ID: skill.ID, Name: skill.Name, Version: skill.Version, Instructions: skill.Instructions})
			return
		}
	}
	httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Skill not found for this page."})
}
