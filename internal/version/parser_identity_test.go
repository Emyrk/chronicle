package version

import (
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParserCompatibilityIdentityDefault(t *testing.T) {
	t.Setenv(ParserDevelopmentIdentityEnv, "")
	actual, err := ParserCompatibilityIdentity()
	require.NoError(t, err)
	exact, err := BinaryIdentity()
	require.NoError(t, err)
	require.Equal(t, exact, actual)
	require.False(t, IsParserDevelopmentIdentity(actual))
}
func TestParserDevelopmentIdentityAcrossBuilds(t *testing.T) {
	t.Parallel()
	buildA := func() (string, error) { return "sha256:" + strings.Repeat("a", 64), nil }
	buildB := func() (string, error) { return "sha256:" + strings.Repeat("b", 64), nil }
	a, err := parserCompatibilityIdentity("local.test-1", buildA)
	require.NoError(t, err)
	b, err := parserCompatibilityIdentity("local.test-1", buildB)
	require.NoError(t, err)
	require.Equal(t, a, b)
	require.True(t, IsParserDevelopmentIdentity(a))
	require.Len(t, a, len("dev-sha256:")+64)
	other, err := parserCompatibilityIdentity("other", buildA)
	require.NoError(t, err)
	require.NotEqual(t, a, other)
	exact, err := parserCompatibilityIdentity("", buildA)
	require.NoError(t, err)
	require.NotEqual(t, a, exact)
}
func TestParserDevelopmentIdentityEnvironment(t *testing.T) {
	t.Setenv(ParserDevelopmentIdentityEnv, "local-session")
	actual, err := ParserCompatibilityIdentity()
	require.NoError(t, err)
	require.True(t, IsParserDevelopmentIdentity(actual))
	require.NotContains(t, actual, "local-session")
}
func TestParserDevelopmentIdentityMalformed(t *testing.T) {
	for _, label := range []string{"-bad", ".bad", "_bad", "two words", "a/b", "a\n", "é", strings.Repeat("x", 65)} {
		t.Run(label, func(t *testing.T) {
			t.Setenv(ParserDevelopmentIdentityEnv, label)
			identity, err := ParserCompatibilityIdentity()
			require.Error(t, err)
			require.Empty(t, identity)
			require.NotContains(t, err.Error(), label)
		})
	}
}
func TestParserCompatibilityIdentityDoesNotHideExactFailure(t *testing.T) {
	t.Parallel()
	failure := errors.New("cannot hash executable")
	_, err := parserCompatibilityIdentity("", func() (string, error) { return "", failure })
	require.ErrorIs(t, err, failure)
}
