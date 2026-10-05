package api

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/semverenc"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
)

func TestAdminMinParserVersion(t *testing.T) {
	t.Parallel()

	t.Run("defaults to current parser version", func(t *testing.T) {
		t.Parallel()

		gotVersion, gotVersionNum := adminMinParserVersion("")
		require.Equal(t, version.ExactParserVersion(), gotVersion)
		require.Equal(t, semverenc.Encode(version.ExactParserVersion()), gotVersionNum)
	})

	t.Run("uses requested parser version", func(t *testing.T) {
		t.Parallel()

		gotVersion, gotVersionNum := adminMinParserVersion("v1.0.18+build")
		require.Equal(t, "v1.0.18+build", gotVersion)
		require.Equal(t, semverenc.Encode("v1.0.18+build"), gotVersionNum)
	})
}
