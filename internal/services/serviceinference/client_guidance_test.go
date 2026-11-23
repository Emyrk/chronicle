package serviceinference

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/stretchr/testify/require"
)

func TestClientGuidanceParityWithoutProvider(t *testing.T) {
	t.Parallel()
	handler := (&Service{}).routes()
	for _, page := range []struct{ capability, assistantID string }{
		{"", "site-help"}, {searchPageCapabilityID, "site-help"}, {instancePageCapabilityID, "instance-analyst"}, {luaEditorCapabilityID, addonWorkshopPanelAssistantID},
	} {
		t.Run(page.capability, func(t *testing.T) {
			t.Parallel()
			query := ""
			if page.capability != "" {
				query = "?capability_id=" + page.capability
			}
			get := func(path string, into any) {
				t.Helper()
				recorder := httptest.NewRecorder()
				handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path+query, nil))
				require.Equal(t, 200, recorder.Code, recorder.Body.String())
				require.Less(t, recorder.Body.Len(), maxClientResult-4096)
				if page.capability == luaEditorCapabilityID {
					envelope, err := json.Marshal(map[string]any{"result": recorder.Body.String()})
					require.NoError(t, err)
					require.Less(t, len(envelope), (64<<10)-4096)
				}
				require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), into))
			}
			var context chroniclesdk.InferenceClientPageContext
			get("/client-tools/context", &context)
			expected, err := withRuntimeSkills(assistants[page.assistantID])
			require.NoError(t, err)
			require.Equal(t, expected.ID, context.AssistantID)
			require.Equal(t, expected.Name, context.AssistantName)
			require.Equal(t, expected.System, context.Prompt)
			require.Contains(t, context.Instructions, "list_skill")
			require.Contains(t, context.Instructions, "read_skill")
			require.Contains(t, context.Instructions, "approval")
			require.Contains(t, context.Instructions, "advertised")
			var list chroniclesdk.InferenceClientSkillsResponse
			get("/client-tools/skills", &list)
			require.Equal(t, context.Skills, list.Skills)
			count := len(expected.Skills)
			if page.capability == luaEditorCapabilityID {
				count += len(luaReferenceSkills)
			}
			require.Len(t, list.Skills, count)
			previous := ""
			for _, skill := range list.Skills {
				require.Greater(t, skill.ID, previous)
				previous = skill.ID
				var result chroniclesdk.InferenceClientSkillResponse
				get("/client-tools/skills/"+skill.ID, &result)
				require.Equal(t, skill.ID, result.ID)
				require.Equal(t, skill.Name, result.Name)
				require.Equal(t, skill.Version, result.Version)
				if strings.HasPrefix(skill.ID, luaModuleAPISkillID) {
					output, err := readLuaReference(`{"skill_id":"` + skill.ID + `"}`)
					require.NoError(t, err)
					var canonical chroniclesdk.InferenceClientSkillResponse
					require.NoError(t, json.Unmarshal([]byte(output), &canonical))
					require.Equal(t, canonical, result)
					if skill.ID == luaModuleAPISkillID {
						require.Contains(t, context.Prompt, result.Instructions)
					}
				} else {
					canonical := runtimeSkills[skill.ID]
					require.Contains(t, expected.Skills, skill.ID)
					require.Equal(t, canonical.Name, result.Name)
					require.Equal(t, canonical.Version, result.Version)
					require.Equal(t, canonical.Instructions, result.Instructions)
				}
			}
			for _, tool := range pageGuidanceClientTools {
				require.Equal(t, page.capability == luaEditorCapabilityID && tool.Name == "read_skill", assistantAllowsTool(expected, tool.Name))
			}
		})
	}
}

func TestClientGuidanceRejectsInvalidScope(t *testing.T) {
	t.Parallel()
	handler := (&Service{}).routes()
	for _, path := range []string{"/client-tools/context", "/client-tools/skills", "/client-tools/skills/chronicle-concepts"} {
		for _, query := range []string{"?capability_id=", "?capability_id=unknown", "?capability_id=%ZZ", "?capability_id=page-guidance", "?capability_id=lua-editor&capability_id=search-page"} {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path+query, nil))
			require.Equal(t, 400, recorder.Code, path+query)
		}
	}
	for _, path := range []string{"/client-tools/skills/unknown", "/client-tools/skills/lua-module-api", "/client-tools/skills/chronicle-concepts?capability_id=lua-editor"} {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		require.Equal(t, 404, recorder.Code, path)
	}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	writeClientGuidance(recorder, request, strings.Repeat("x", maxClientResult))
	require.Equal(t, 500, recorder.Code)
	require.Less(t, recorder.Body.Len(), 200)
}

func TestPageGuidanceToolArguments(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"gen_page_context", "list_skill", "read_skill"} {
		tool, ok := clientToolByName(pageGuidanceCapabilityID, name)
		require.True(t, ok)
		require.Equal(t, 1, tool.CapabilityVersion)
		require.Equal(t, "read", tool.Effect)
		require.Equal(t, "never", tool.Confirmation)
		require.True(t, json.Valid(tool.Parameters))
		valid := `{}`
		invalid := []string{`null`, `[]`, `{"extra":true}`, `{} {}`}
		if name == "read_skill" {
			valid = `{"skill_id":"lua-module-api"}`
			invalid = append(invalid, `{}`, `{"skill_id":null}`, `{"skill_id":1}`, `{"skill_id":""}`, `{"skill_id":" "}`, `{"skill_id":"`+strings.Repeat("a", 101)+`"}`, `{"skill_id":"a","extra":true}`)
		}
		_, err := validateClientToolArguments(name, valid)
		require.NoError(t, err)
		for _, raw := range invalid {
			_, err = validateClientToolArguments(name, raw)
			require.Error(t, err, name+raw)
		}
	}
}
