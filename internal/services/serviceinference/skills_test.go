package serviceinference

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRuntimeSkillsComposeConcepts(t *testing.T) {
	t.Parallel()
	original := assistants["site-help"]
	composed, err := withRuntimeSkills(original)
	require.NoError(t, err)
	require.Equal(t, original.Tools, composed.Tools)
	require.NotContains(t, original.System, "## Skill:")
	require.Contains(t, composed.System, "## Skill: Chronicle log concepts")
	require.Contains(t, composed.System, "encounter")
	require.Contains(t, composed.System, "parse")
	require.Len(t, debugRuntimeSkills(composed), 1)
	require.Equal(t, "chronicle-concepts", debugRuntimeSkills(composed)[0].ID)
}

func TestRuntimeSkillsRejectUnknownOrDuplicate(t *testing.T) {
	t.Parallel()
	for _, skills := range [][]string{{"not-a-skill"}, {"chronicle-concepts", "chronicle-concepts"}} {
		_, err := withRuntimeSkills(assistant{Skills: skills})
		require.Error(t, err)
	}
	duplicate := assistant{Tools: []ToolDefinition{{Name: "test_tool", Parameters: json.RawMessage(`{}`)}}, Skills: []string{"test-skill"}}
	// Keep the test independent of the global registry: a skill's advertised tools may not shadow an assistant tool.
	_, err := composeRuntimeSkills(duplicate, map[string]runtimeSkill{"test-skill": {ID: "test-skill", Tools: []ToolDefinition{{Name: "test_tool"}}}})
	require.Error(t, err)
}
