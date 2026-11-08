package serviceexternalapi

import (
	"bytes"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// lockedBuffer is a log sink safe for concurrent writes.
type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

// httpmw.Log500 logs the start of every 500 body, so a failing agent view
// must not put the key (or the username) in it.
func TestAgentErrorViewKeepsKeyOutOfLogs(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	f.store.rankingRecordsErr = errors.New("database is down")
	var logs lockedBuffer
	handler := httpmw.Log500(slog.New(slog.NewTextHandler(&logs, nil)))(f.router)

	req := httptest.NewRequest(http.MethodGet, "/instances/fixture-run?ai_key="+f.secret, nil)
	req.Host = "chronicle.example"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req.WithContext(testutil.Context(t, testutil.WaitMedium)))

	require.Equal(t, http.StatusInternalServerError, rec.Code)
	requirePrivate(t, rec)
	require.Contains(t, logs.String(), "returned 500", "the 500 was logged")
	require.Contains(t, logs.String(), "couldn't load this page")
	for _, secret := range []string{f.secret, "ai_key", "raidlead"} {
		require.NotContains(t, logs.String(), secret)
		require.NotContains(t, rec.Body.String(), secret)
	}
}

// A malformed query string can make the key middleware pass a request
// through without a key. That must never reach the agent views.
func TestAgentMalformedQueriesGetNoView(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	for _, query := range []string{"%zz", "ai_key=%zz", "x=1;y=2"} {
		t.Run(query, func(t *testing.T) {
			before := f.lookups.Load()
			rec := f.do(t, http.MethodGet, "/instances/fixture-run?"+query, false)
			require.Equal(t, http.StatusOK, rec.Code)
			require.Equal(t, "<html>SPA</html>", rec.Body.String())
			<-f.spa.queries
			require.NotContains(t, rec.Body.String(), "Deaths")
			requirePrivate(t, rec)
			require.Equal(t, before, f.lookups.Load())

			rec = f.do(t, http.MethodGet, "/llms.txt?"+query, false)
			require.Equal(t, http.StatusOK, rec.Code)
			require.Contains(t, rec.Body.String(), "Search without a key", "only the public guide")
			require.NotContains(t, rec.Body.String(), "## Search fields")
			requirePrivate(t, rec)
		})
	}
}

func TestLLMsTxtHead(t *testing.T) {
	t.Parallel()
	f := newAgentFixture(t)
	rec := f.do(t, http.MethodHead, "/llms.txt", false)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "text/plain; charset=utf-8", rec.Header().Get("Content-Type"))
	rec = f.do(t, http.MethodHead, "/llms.txt?ai_key="+f.secret, false)
	require.Equal(t, http.StatusOK, rec.Code)
	requirePrivate(t, rec)
}

// Car 4's Copy for AI on the search page copies a where= (JSON tree) URL.
func TestSearchMenuFromWhereURL(t *testing.T) {
	t.Parallel()
	f := newSearchFixture(t)
	key := f.aiKeys["free"]
	v := url.Values{
		"where":  {`{"and":[{"field":"instance.name","op":"=","value":"Molten Core"},{"field":"instance.realm","op":"=","value":"` + f.realm + `"}]}`},
		"format": {"md"}, "sort": {"instance.started_at"}, "dir": {"desc"}, "ai_key": {key},
	}
	rec := f.get(t, "192.0.2.92", "/raidlogs/search?"+v.Encode())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := rec.Body.String()
	require.Contains(t, body, "# Search results")
	require.Contains(t, body, "Chronicle agent view for")
	require.Contains(t, body, "## Narrow by")
	require.Equal(t, 2, strings.Count(body, "- [Remove "))
	for _, m := range markdownLinkRE.FindAllStringSubmatch(body, -1) {
		u, err := url.Parse(m[1])
		require.NoError(t, err)
		if u.Path != "/api/external/v1/raidlogs/search" {
			continue
		}
		require.Empty(t, u.Query().Get("where"), "menu links switch to q=")
		require.Equal(t, "instance.started_at", u.Query().Get("sort"))
		n, err := instancesearch.ParseCEL(u.Query().Get("q"))
		require.NoError(t, err, m[1])
		_, err = instancesearch.Compile(instancesearch.Query{Where: n}, instancesearch.Options{})
		require.NoError(t, err, m[1])
	}
	// A narrow link from it runs.
	next := f.get(t, "192.0.2.92", followLink(t, body, "Last 90 days"))
	require.Equal(t, http.StatusOK, next.Code, next.Body.String())
}

// A long query makes every menu link long. Links that would exceed the
// query limit are dropped and the page stays bounded.
func TestSearchMenuLongQuery(t *testing.T) {
	t.Parallel()
	f := newSearchFixture(t)
	key := f.aiKeys["honored"]
	for _, pad := range []int{3600, searchMaxQueryLen - 20} {
		// Build q in canonical form, exactly pad bytes long.
		build := func(names []string) string {
			return `instance.name == "Molten Core" && !(instance.recorder in [` + strings.Join(names, ", ") + `])`
		}
		var names []string
		for len(build(append(names, `"`+strings.Repeat("x", 190)+`"`))) <= pad {
			names = append(names, `"`+strings.Repeat(string(rune('a'+len(names))), 190)+`"`)
		}
		names = append(names, `"`+strings.Repeat("z", pad-len(build(append(names, `""`))))+`"`)
		q := build(names)
		require.Len(t, q, pad)
		parsed, err := instancesearch.ParseCEL(q)
		require.NoError(t, err)
		require.Equal(t, q, celText(parsed), "q is already canonical")
		require.LessOrEqual(t, len(q), searchMaxQueryLen)
		v := url.Values{"q": {q}, "format": {"md"}, "limit": {"100"}, "ai_key": {key}}
		rec := f.get(t, "192.0.2.93", "/raidlogs/search?"+v.Encode())
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := rec.Body.String()
		require.LessOrEqual(t, len(body), maxAgentViewBytes+200, "pad %d", pad)
		require.Contains(t, body, "Open this search in Chronicle", "pad %d: the user link survives", pad)
		require.Equal(t, 2, strings.Count(body, "- [Remove "), "pad %d", pad)
		if pad == 3600 {
			require.Contains(t, body, "More filters were left out", "the narrow-by budget applies")
		} else {
			// A class filter would push the query over the limit, so its link
			// is left out rather than offered and rejected.
			n, err := instancesearch.ParseCEL(q)
			require.NoError(t, err)
			require.Greater(t, len(celText(n))+len(` && players.exists(p, p.class == "WARRIOR")`), searchMaxQueryLen)
			require.NotContains(t, body, "[Has a Warrior]")
		}
		for _, m := range markdownLinkRE.FindAllStringSubmatch(body, -1) {
			u, err := url.Parse(m[1])
			require.NoError(t, err)
			if u.Path == "/api/external/v1/raidlogs/search" {
				require.LessOrEqual(t, len(u.Query().Get("q")), searchMaxQueryLen, m[1])
			}
		}
	}
}
