package sidekickstorage

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/luadata"
	"github.com/stretchr/testify/require"
)

func TestSavedVariablesAssignmentSelection(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ name, input, want string }{
		{"canonical", `Other = {}; ChronicleSidekickBridgeWoTLKDB = {marker = "canonical"}`, "canonical"},
		{"legacy", `ChronicleCompanionWoTLKDB = {marker = "legacy"}; Other = {}`, "legacy"},
		{"canonical wins", `ChronicleCompanionWoTLKDB = {marker = "legacy"}; ChronicleSidekickBridgeWoTLKDB = {marker = "canonical"}`, "canonical"},
		{"canonical stops reading", `ChronicleSidekickBridgeWoTLKDB = {marker = "canonical"}; --[[ unfinished`, "canonical"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := parseSavedVariables(t.Context(), tc.input)
			require.NoError(t, err)
			require.Equal(t, tc.want, got.Fields["marker"].Text)
		})
	}
}

func TestSavedVariablesArrayKeys(t *testing.T) {
	t.Parallel()
	for _, input := range []string{`{1, 2}`, `{[1] = 1, [2] = 2}`, `{["1"] = 1, ["2"] = 2}`, `{1, [2] = 2}`} {
		value, err := luadata.ParseTable(t.Context(), "{items="+input+"}")
		require.NoError(t, err)
		items, err := requiredArray(value, "items")
		require.NoError(t, err)
		require.Equal(t, []luadata.Value{{Kind: luadata.Number, Text: "1"}, {Kind: luadata.Number, Text: "2"}}, items)
	}
	value, err := luadata.ParseTable(t.Context(), `{items = {[1] = 1, ["1"] = 2}}`)
	require.NoError(t, err)
	_, err = requiredArray(value, "items")
	require.ErrorContains(t, err, "duplicate")
}
