package frontend

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

// blogPostHead mirrors the head that scripts/prerender-blog.mjs writes for a post
// (see src/blog/blogHead.test.ts): the post copy is baked in and the canonical,
// og:url and JSON-LD remain template tags for the server.
const blogPostHead = `<!doctype html>
<html><head>
<meta name="description" content="Watch every pull again." />
<!-- {{ if .CanonicalURL }} --><link rel="canonical" href="{{ .CanonicalURL }}" /><!-- {{ end }} -->
<meta property="og:title" content="Replay · Chronicle Journal" />
<meta property="og:description" content="Watch every pull again." />
<!-- {{ if .CanonicalURL }} --><meta property="og:url" content="{{ .CanonicalURL }}" /><!-- {{ end }} -->
<meta name="twitter:title" content="Replay · Chronicle Journal" />
<meta name="twitter:description" content="Watch every pull again." />
<!-- {{ if .JSONLD }} --><script type="application/ld+json">{{ .JSONLD }}</script><!-- {{ end }} -->
<title>Replay · Chronicle Journal</title>
</head><body><div id="root"><article>Replay</article></div></body></html>`

func blogHeadSiteFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":       &fstest.MapFile{Data: []byte(`<html><body>home</body></html>`)},
		"blog/index.html":  &fstest.MapFile{Data: []byte(blogPostHead)},
		"blog/replay.html": &fstest.MapFile{Data: []byte(blogPostHead)},
		"blog-manifest.json": &fstest.MapFile{Data: []byte(`{
			"posts": [{
				"path": "/blog/replay",
				"title": "Replay </script><script>alert(1)</script>",
				"description": "Watch every pull again.",
				"published_at": "2026-10-01",
				"flavor_sets": []
			}]
		}`)},
	}
}

func blogHeadBranding(r *http.Request) *HTMLBranding {
	canonical := "https://" + r.Host + r.URL.EscapedPath()
	return &HTMLBranding{
		Title:        "WoW Forever by Chronicle",
		SiteName:     "WoW Forever",
		Description:  "Tenant tagline",
		CanonicalURL: canonical,
		JSONLD:       `{"@context":"https://schema.org","@type":"WebSite","name":"WoW Forever","url":"https://` + r.Host + `/"}`,
	}
}

func serveBlogHead(t *testing.T, target string) string {
	t.Helper()
	handler := Handler(blogHeadSiteFS(), nil, blogHeadBranding, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))
	require.Equal(t, http.StatusOK, recorder.Code)
	return recorder.Body.String()
}

func metaContent(t *testing.T, body, attribute, key string) string {
	t.Helper()
	matches := regexp.MustCompile(`<meta ` + attribute + `="` + regexp.QuoteMeta(key) + `" content="([^"]*)"`).FindAllStringSubmatch(body, -1)
	require.Len(t, matches, 1, "expected exactly one %s meta tag", key)
	return matches[0][1]
}

func TestHandlerRendersBlogPostHead(t *testing.T) {
	t.Parallel()

	body := serveBlogHead(t, "https://forever.chronicleclassic.com/blog/replay")

	canonicals := regexp.MustCompile(`<link rel="canonical" href="([^"]*)"`).FindAllStringSubmatch(body, -1)
	require.Len(t, canonicals, 1)
	canonical := canonicals[0][1]
	require.Equal(t, "https://forever.chronicleclassic.com/blog/replay", canonical)
	require.Equal(t, canonical, metaContent(t, body, "property", "og:url"))

	require.Equal(t, metaContent(t, body, "property", "og:title"), metaContent(t, body, "name", "twitter:title"))
	require.Equal(t, metaContent(t, body, "property", "og:description"), metaContent(t, body, "name", "twitter:description"))

	scripts := regexp.MustCompile(`(?s)<script type="application/ld\+json">(.*?)</script>`).FindAllStringSubmatch(body, -1)
	require.Len(t, scripts, 1, "the post title must not break out of the JSON-LD script")
	var nodes []map[string]any
	require.NoError(t, json.Unmarshal([]byte(scripts[0][1]), &nodes))
	require.Len(t, nodes, 2)
	require.Equal(t, "WebSite", nodes[0]["@type"])

	posting := nodes[1]
	require.Equal(t, "https://schema.org", posting["@context"])
	require.Equal(t, "BlogPosting", posting["@type"])
	require.Equal(t, "Replay </script><script>alert(1)</script>", posting["headline"])
	require.Equal(t, "Watch every pull again.", posting["description"])
	require.Equal(t, "2026-10-01", posting["datePublished"])
	require.Equal(t, canonical, posting["url"])
	require.Equal(t, map[string]any{
		"@type": "Organization",
		"name":  "Chronicle",
		"url":   "https://chronicleclassic.com/",
	}, posting["publisher"])
}

func TestHandlerBlogIndexHasNoBlogPosting(t *testing.T) {
	t.Parallel()

	body := serveBlogHead(t, "https://everlook.chronicleclassic.com/blog")

	canonicals := regexp.MustCompile(`<link rel="canonical" href="([^"]*)"`).FindAllStringSubmatch(body, -1)
	require.Len(t, canonicals, 1)
	require.Equal(t, "https://everlook.chronicleclassic.com/blog", canonicals[0][1])
	require.Equal(t, canonicals[0][1], metaContent(t, body, "property", "og:url"))
	require.NotContains(t, body, "BlogPosting")
}

func TestWithBlogPostingJSONLDOmitsMissingDate(t *testing.T) {
	t.Parallel()

	data := withBlogPostingJSONLD("", blogManifestPost{Title: "Replay", Description: "d"}, "https://chronicleclassic.com/blog/replay")
	var posting map[string]any
	require.NoError(t, json.Unmarshal([]byte(data), &posting))
	require.Equal(t, "BlogPosting", posting["@type"])
	require.NotContains(t, posting, "datePublished")

	require.Empty(t, withBlogPostingJSONLD("", blogManifestPost{Title: "Replay"}, "/blog/replay"), "relative URLs are not valid BlogPosting URLs")
}
