package frontend

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestBlogPosts(t *testing.T) {
	t.Parallel()

	siteFS := fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: []byte(`{"posts":[
		{"path":"/blog/older","flavor_sets":[],"published_at":"2026-10-01"},
		{"path":"/blog/turtle-only","flavor_sets":[["vanilla","turtle"]],"published_at":"2026-11-01"}
	]}`)}}
	posts, err := BlogPosts(siteFS)
	require.NoError(t, err)
	require.Len(t, posts, 2)
	require.Equal(t, "/blog/turtle-only", posts[0].Path, "newest first")
	require.Equal(t, "2026-11-01", posts[0].PublishedAt)
	require.True(t, posts[0].AllowedFor([]string{"Vanilla", "turtle"}))
	require.False(t, posts[0].AllowedFor([]string{"vanilla"}))
	require.True(t, posts[1].AllowedFor(nil))

	none, err := BlogPosts(fstest.MapFS{})
	require.NoError(t, err)
	require.Empty(t, none)
}
