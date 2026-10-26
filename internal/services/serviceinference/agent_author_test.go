package serviceinference

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLuaProjectAuthorIsEphemeralAndToolFree(t *testing.T) {
	t.Parallel()
	a := assistants["lua-project-author"]
	require.Equal(t, "lua-project-author", a.ID)
	require.False(t, a.Durable)
	require.Empty(t, a.Tools)
	require.NotEqual(t, assistants["instance-analyst"].System, a.System)
	require.True(t, strings.Contains(a.System, "main_lua"))
}
