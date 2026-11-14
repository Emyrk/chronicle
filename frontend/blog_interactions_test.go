package frontend

import (
	"strings"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestBlogInteractionsEligibility(t *testing.T) {
	t.Parallel()
	manifest := fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte(`{"posts":[{"path":"/blog/enabled","interactions_enabled":true,"flavor_sets":[["vanilla","turtle"]]},{"path":"/blog/disabled"}]}`)}}
	for _, tc := range []struct {
		slug   string
		flavor []string
		want   bool
	}{
		{"enabled", []string{"VANILLA", "Turtle"}, true},
		{"enabled", []string{"vanilla"}, false},
		{"disabled", nil, false}, {"missing", nil, false}, {"../enabled", nil, false},
	} {
		t.Run(tc.slug+strings.Join(tc.flavor, "-"), func(t *testing.T) {
			t.Parallel()
			got, err := BlogInteractionsEnabled(manifest, tc.slug, tc.flavor)
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
	got, err := BlogInteractionsEnabled(fstest.MapFS{}, "enabled", nil)
	require.NoError(t, err)
	require.False(t, got)
	_, err = BlogInteractionsEnabled(fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte("invalid")}}, "enabled", nil)
	require.Error(t, err)
}
