package frontend

import (
	"strings"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestBlogInteractionsEligibility(t *testing.T) {
	t.Parallel()
	manifest := fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte(`{"posts":[{"path":"/blog/enabled","voting_enabled":true,"feedback_enabled":true,"flavor_sets":[["vanilla","turtle"]]},{"path":"/blog/disabled"}]}`)}}
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
			for _, kind := range []string{"vote", "feedback"} {
				got, err := BlogInteractionsEnabled(manifest, tc.slug, tc.flavor, kind)
				require.NoError(t, err)
				require.Equal(t, tc.want, got)
			}
		})
	}
	got, err := BlogInteractionsEnabled(fstest.MapFS{}, "enabled", nil, "vote")
	require.NoError(t, err)
	require.False(t, got)
	_, err = BlogInteractionsEnabled(fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte("invalid")}}, "enabled", nil, "vote")
	require.Error(t, err)
}

func TestBlogIndependentEligibility(t *testing.T) {
	t.Parallel()
	manifest := fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte(`{"posts":[{"path":"/blog/vote","voting_enabled":true},{"path":"/blog/feedback","feedback_enabled":true}]}`)}}
	for _, slug := range []string{"vote", "feedback"} {
		for _, kind := range []string{"vote", "feedback"} {
			enabled, err := BlogInteractionsEnabled(manifest, slug, nil, kind)
			require.NoError(t, err)
			require.Equal(t, slug == kind, enabled)
		}
	}
}
