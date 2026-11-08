package serviceexternalapi

import (
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/instancesearch"
)

// followLink finds the link labelled label in a recorded markdown response.
// The walk below only ever requests URLs found this way, like a client that
// can't build URLs (ChatGPT).
func followLink(t *testing.T, body, label string) string {
	t.Helper()
	m := regexp.MustCompile(`\[` + regexp.QuoteMeta(markdownCell.Replace(label)) + `\]\(([^)\s]+)\)`).FindStringSubmatch(body)
	require.NotNil(t, m, "no link %q in:\n%s", label, body)
	return m[1]
}

func TestAgentLinkWalk(t *testing.T) {
	t.Parallel()
	f := newSearchFixture(t)
	key := f.aiKeys["free"]

	var transcript []string
	t.Cleanup(func() {
		if t.Failed() {
			t.Log(strings.Join(transcript, "\n\n----\n\n"))
		}
	})
	fetch := func(u string) string {
		t.Helper()
		rec := f.get(t, "192.0.2.90", u)
		transcript = append(transcript, "GET "+u+"\n\n"+rec.Body.String())
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "text/markdown; charset=utf-8", rec.Header().Get("Content-Type"))
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		return rec.Body.String()
	}

	// The one pasted link: a raid page.
	page := fetch("http://example.com/instances/" + f.runs[0].String() + "?ai_key=" + key)
	require.Contains(t, page, "# Molten Core by Alpha \\| Omega")

	// Hop 1: the guild's runs (one filter).
	guildRuns := fetch(followLink(t, page, "This guild's recent runs (search)"))
	require.Equal(t, 4, strings.Count(guildRuns, "](http://example.com/instances/"), guildRuns)

	// Hop 2: narrow by zone (two filters).
	mc := fetch(followLink(t, guildRuns, "Zone: Molten Core"))
	require.Equal(t, 3, strings.Count(mc, "](http://example.com/instances/"), mc)

	// Hop 3: narrow by realm (three filters).
	last := followLink(t, mc, "Realm: "+f.realm)
	final := fetch(last)
	for _, run := range f.runs {
		require.Contains(t, final, "](http://example.com/instances/"+run.String()+"?ai_key="+key+")")
	}
	u, err := url.Parse(last)
	require.NoError(t, err)
	require.Equal(t, key, u.Query().Get("ai_key"), "followed links keep the key")
	where, err := instancesearch.ParseCEL(u.Query().Get("q"))
	require.NoError(t, err)
	require.Len(t, conjuncts(where), 3, u.Query().Get("q"))

	// The menu offers a way back and a plain link for the user.
	require.Equal(t, 3, strings.Count(final, "- [Remove "))
	user := followLink(t, final, "Open this search in Chronicle")
	require.True(t, strings.HasPrefix(user, "http://example.com/search?"), user)
	require.NotContains(t, user, "ai_key")
	require.NotContains(t, final, "[Zone: ", "zone is already set")

	// Removing a filter goes back to a two-filter search.
	back := fetch(followLink(t, final, "Remove "+celText(&conjuncts(where)[2])))
	require.Contains(t, back, "[Realm: "+f.realm+"]")
}

func TestSearchMenuAnonymousHasNoMenu(t *testing.T) {
	t.Parallel()
	f := newSearchFixture(t)
	rec := f.get(t, "192.0.2.91", searchPath("q", mcText, "format", "md"))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NotContains(t, rec.Body.String(), "Narrow by")
}
