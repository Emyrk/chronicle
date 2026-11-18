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

func TestClientToolCatalogWithoutProvider(t *testing.T) {
	t.Parallel()
	s := &Service{}
	handler := s.routes()
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/client-tools", nil))
	require.Equal(t, http.StatusOK, recorder.Code)
	var result chroniclesdk.InferenceClientToolsResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &result))
	count := 0
	for _, capability := range clientCapabilities {
		count += len(capability.Tools)
	}
	require.Len(t, result.Tools, count)
	previous := ""
	for _, actual := range result.Tools {
		expected, ok := clientToolByName(actual.CapabilityID, actual.Name)
		require.True(t, ok)
		require.JSONEq(t, string(expected.Parameters), string(actual.InputSchema))
		require.Equal(t, expected.Description, actual.Description)
		require.Equal(t, expected.CapabilityVersion, actual.CapabilityVersion)
		require.Equal(t, expected.Effect, actual.Effect)
		require.Equal(t, expected.Confirmation, actual.Confirmation)
		key := actual.CapabilityID + "/" + actual.Name
		require.Greater(t, key, previous)
		previous = key
	}
}

func TestValidateClientToolWithoutProvider(t *testing.T) {
	t.Parallel()
	handler := (&Service{}).routes()
	for _, test := range []struct {
		name, body string
		status     int
	}{
		{"valid", `{"name":"save_lua_files","capability_id":"lua-editor","capability_version":1,"arguments":{"expected_revision":0}}`, 200},
		{"read", `{"name":"read_lua_files","capability_id":"lua-editor","capability_version":1,"arguments":{}}`, 200},
		{"wrong capability", `{"name":"save_lua_files","capability_id":"instance-page","capability_version":1,"arguments":{"expected_revision":0}}`, 400},
		{"wrong version", `{"name":"save_lua_files","capability_id":"lua-editor","capability_version":2,"arguments":{"expected_revision":0}}`, 400},
		{"unknown tool", `{"name":"execute","capability_id":"lua-editor","capability_version":1,"arguments":{}}`, 400},
		{"null", `{"name":"read_lua_files","capability_id":"lua-editor","capability_version":1,"arguments":null}`, 400},
		{"missing revision", `{"name":"save_lua_files","capability_id":"lua-editor","capability_version":1,"arguments":{}}`, 400},
		{"trailing", `{} {}`, 400},
		{"unknown envelope field", `{"extra":true}`, 400},
		{"oversize", strings.Repeat(" ", maxToolArguments+4097), 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/client-tools/validate", strings.NewReader(test.body)))
			require.Equal(t, test.status, recorder.Code)
			if test.status == 200 {
				var input chroniclesdk.InferenceValidateClientToolRequest
				var output chroniclesdk.InferenceValidateClientToolResponse
				require.NoError(t, json.Unmarshal([]byte(test.body), &input))
				require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &output))
				require.JSONEq(t, string(input.Arguments), string(output.Arguments))
			} else {
				require.Less(t, recorder.Body.Len(), 200)
			}
		})
	}
}

func TestSaveLuaFilesArguments(t *testing.T) {
	t.Parallel()
	tool, ok := clientToolByName(luaEditorCapabilityID, "save_lua_files")
	require.True(t, ok)
	require.Equal(t, "view_mutation", tool.Effect)
	require.Equal(t, "unless_yolo", tool.Confirmation)
	require.JSONEq(t, `{"type":"object","properties":{"expected_revision":{"type":"integer","minimum":0}},"required":["expected_revision"],"additionalProperties":false}`, string(tool.Parameters))
	for _, raw := range []string{`{}`, `null`, `[]`, `{"expected_revision":null}`, `{"expected_revision":-1}`, `{"expected_revision":1.5}`, `{"expected_revision":"1"}`, `{"expected_revision":0,"extra":true}`, `{"expected_revision":0} {}`, `{"expected_revision":9223372036854775808}`} {
		_, err := validateClientToolArguments(tool.Name, raw)
		require.Error(t, err, raw)
	}
	_, err := validateClientToolArguments(tool.Name, `{"expected_revision":0}`)
	require.NoError(t, err)
}
