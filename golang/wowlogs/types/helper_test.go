package types_test

import (
	"regexp"
	"testing"

	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/stretchr/testify/require"
)

func TestMatchStack(t *testing.T) {
	t.Parallel()

	re := regexp.MustCompile(`(hello) (world) (\d+)`)
	p := types.FromRegex(re)
	content := "hello world 1234"

	matched, ok := p.Match(content)
	require.True(t, ok)
	require.Equal(t, "hello", matched.String())
	require.Equal(t, "world", matched.String())
	require.Equal(t, "1234", matched.String())
	require.Nil(t, matched.Error())
}
