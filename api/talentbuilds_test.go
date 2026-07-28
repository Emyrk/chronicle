package api

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidTalentBuildString(t *testing.T) {
	t.Parallel()

	valid := []string{"", "3", "35003-05032-00000", "5-3005301", "000"}
	for _, build := range valid {
		require.True(t, validTalentBuildString(build), "expected valid: %q", build)
	}

	invalid := []string{
		"abc",
		"35003_05032",
		"35003-05032;DROP TABLE users",
		"3.5",
		strings.Repeat("5", 513),
	}
	for _, build := range invalid {
		require.False(t, validTalentBuildString(build), "expected invalid: %q", build)
	}
}

func TestValidateTalentBuildName(t *testing.T) {
	t.Parallel()

	name, ok := validateTalentBuildName("  Fury PvE  ")
	require.True(t, ok)
	require.Equal(t, "Fury PvE", name)

	_, ok = validateTalentBuildName("   ")
	require.False(t, ok)

	_, ok = validateTalentBuildName(strings.Repeat("a", 65))
	require.False(t, ok)

	name, ok = validateTalentBuildName(strings.Repeat("a", 64))
	require.True(t, ok)
	require.Len(t, name, 64)
}
