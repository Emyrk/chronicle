package frontend

import (
	"strings"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestBlogInteractionsEligibility(t *testing.T) {
	t.Parallel()
	manifest := fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte(`{"posts":[{"path":"/blog/enabled","voting_enabled":true,"feedback_enabled":true,"flavor_sets":[["vanilla","turtle"]]},{"path":"/blog/disabled","voting_enabled":false,"feedback_enabled":false}]}`)}}
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
	for _, kind := range []string{"vote", "feedback"} {
		got, err := BlogInteractionsEnabled(fstest.MapFS{}, "enabled", nil, kind)
		require.NoError(t, err)
		require.False(t, got)
		_, err = BlogInteractionsEnabled(fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte("invalid")}}, "enabled", nil, kind)
		require.Error(t, err)
	}
}

func TestBlogDefaultInteractionEligibility(t *testing.T) {
	t.Parallel()
	manifest := fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte(`{"posts":[{"path":"/blog/default","flavor_sets":[["turtle"]]}]}`)}}
	for _, tc := range []struct {
		slug   string
		flavor []string
		kind   string
		want   bool
	}{
		{"default", []string{"turtle"}, "vote", true},
		{"default", []string{"turtle"}, "feedback", true},
		{"default", []string{"other"}, "vote", false},
		{"missing", []string{"turtle"}, "vote", false},
		{"default", []string{"other"}, "feedback", false},
		{"missing", []string{"turtle"}, "feedback", false},
	} {
		enabled, err := BlogInteractionsEnabled(manifest, tc.slug, tc.flavor, tc.kind)
		require.NoError(t, err)
		require.Equal(t, tc.want, enabled)
	}
}

func TestBlogIndependentEligibility(t *testing.T) {
	t.Parallel()
	manifest := fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte(`{"posts":[{"path":"/blog/vote","voting_enabled":true,"feedback_enabled":false},{"path":"/blog/feedback","voting_enabled":false,"feedback_enabled":true}]}`)}}
	for _, slug := range []string{"vote", "feedback"} {
		for _, kind := range []string{"vote", "feedback"} {
			enabled, err := BlogInteractionsEnabled(manifest, slug, nil, kind)
			require.NoError(t, err)
			require.Equal(t, slug == kind, enabled)
		}
	}
}
