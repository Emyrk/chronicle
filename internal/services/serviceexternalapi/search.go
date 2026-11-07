package serviceexternalapi

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/aikey"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/serviceinstancesearch"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

// searchMaxQueryLen bounds q and where. Real searches are a few hundred
// bytes; the cap keeps parse work small, since malformed input is not charged
// to the search bucket.
const searchMaxQueryLen = 4 << 10

// SearchResponse is a page of GET /raidlogs/search results. It replaces the
// POST response's structured next with the opaque next_cursor string.
type SearchResponse struct {
	Results []chroniclesdk.InstanceSearchResult `json:"results"`
	// NextCursor is set when more results exist. Pass it back as cursor.
	NextCursor string `json:"next_cursor,omitempty"`
}

// searchCaller is the AI key's owner when the request carries a valid
// ai_key, so their tier's budget, fields and sorts apply. Otherwise it is
// anonymous: the anonymous subset, limits and per-IP bucket apply.
func searchCaller(r *http.Request) serviceinstancesearch.Caller {
	c := serviceinstancesearch.Caller{TenantID: servicetenant.TenantIDFromContext(r.Context()), IP: externalClientIP(r)}
	if key, ok := aikey.FromContext(r.Context()); ok {
		c.UserID = key.UserID
	}
	return c
}

// searchWhere reads the search tree from q (query text) or where (JSON).
// Neither means match everything.
func searchWhere(v url.Values) (*chroniclesdk.InstanceSearchNode, string, error) {
	q, where := v.Get("q"), v.Get("where")
	switch {
	case q != "" && where != "":
		return nil, "Use either q or where, not both.", nil
	case len(q) > searchMaxQueryLen || len(where) > searchMaxQueryLen:
		return nil, "The search is too long.", nil
	case q != "":
		n, err := instancesearch.ParseCEL(q)
		if err != nil {
			return nil, "Invalid search text.", err
		}
		return n, "", nil
	case where != "":
		var n chroniclesdk.InstanceSearchNode
		if err := json.Unmarshal([]byte(where), &n); err != nil {
			return nil, "where must be a JSON search tree.", err
		}
		return &n, "", nil
	}
	return nil, "", nil
}

func encodeSearchCursor(c *chroniclesdk.InstanceSearchCursor) string {
	if c == nil {
		return ""
	}
	raw, err := json.Marshal(c)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeSearchCursor(s string) (*chroniclesdk.InstanceSearchCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, err
	}
	var c chroniclesdk.InstanceSearchCursor
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

// searchQuery builds the full query from GET parameters. A non-empty message
// means the request is malformed.
func searchQuery(v url.Values) (chroniclesdk.InstanceSearchQuery, string, error) {
	var q chroniclesdk.InstanceSearchQuery
	where, msg, err := searchWhere(v)
	if msg != "" {
		return q, msg, err
	}
	q.Where = where
	if field, dir := v.Get("sort"), v.Get("dir"); field != "" || dir != "" {
		q.Sort = &chroniclesdk.InstanceSearchSort{Field: chroniclesdk.InstanceSearchSortField(field), Direction: chroniclesdk.InstanceSearchSortDirection(dir)}
	}
	if s := v.Get("limit"); s != "" {
		limit, err := strconv.Atoi(s)
		if err != nil || limit < 1 {
			return q, "limit must be a positive integer.", err
		}
		q.Limit = limit
	}
	if s := v.Get("cursor"); s != "" {
		c, err := decodeSearchCursor(s)
		if err != nil {
			return q, "cursor is not valid. Use next_cursor from the previous page.", err
		}
		q.Cursor = c
	}
	return q, "", nil
}

// badSearch rejects a malformed request without charging the search bucket,
// as the POST endpoints do for malformed bodies.
func (s *Service) badSearch(w http.ResponseWriter, r *http.Request, c serviceinstancesearch.Caller, explain bool, start time.Time, msg string, err error) {
	s.search.ObserveInvalidBody(c, explain, start)
	if st, _, peekErr := s.search.Peek(r.Context(), c); peekErr == nil {
		ratelimit.SetHeaders(w, st)
	}
	resp := chroniclesdk.Response{Message: msg}
	if err != nil {
		resp.Detail = err.Error()
	}
	httpapi.Write(r.Context(), w, http.StatusBadRequest, resp)
}

func (s *Service) searchInstances(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	c := searchCaller(r)
	v := r.URL.Query()
	format := v.Get("format")
	if format != "" && format != "json" && format != "md" {
		s.badSearch(w, r, c, false, start, "format must be json or md.", nil)
		return
	}
	q, msg, err := searchQuery(v)
	if msg != "" {
		s.badSearch(w, r, c, false, start, msg, err)
		return
	}
	if key, ok := aikey.FromContext(r.Context()); ok && q.Limit > key.Benefits.ResultsPerSearch {
		writeKeyLimitTooLarge(w, r, key.Benefits)
		return
	}
	page, result := s.search.Search(r.Context(), c, q)
	serviceinstancesearch.WriteResult(w, r, result, false)
	if result.Err != nil {
		return
	}
	resp := SearchResponse{Results: page.Results, NextCursor: encodeSearchCursor(page.Next)}
	if format == "md" {
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(searchMarkdown(r, resp)))
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, resp)
}

// writeKeyLimitTooLarge rejects a page size above the key's tier, uncharged.
func writeKeyLimitTooLarge(w http.ResponseWriter, r *http.Request, b chroniclesdk.AIKeyBenefits) {
	resp := chroniclesdk.Response{Message: fmt.Sprintf("limit can be at most %d with this AI key.", b.ResultsPerSearch)}
	for _, t := range aikey.AllTiers() {
		if t.ResultsPerSearch > b.ResultsPerSearch {
			resp.CallToAction = fmt.Sprintf("Supporters get up to %d results per search.", t.ResultsPerSearch)
			resp.Link, resp.LinkText = "/supporter", "View supporter perks"
			break
		}
	}
	httpapi.Write(r.Context(), w, http.StatusForbidden, resp)
}

func (s *Service) searchExplain(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	c := searchCaller(r)
	v := r.URL.Query()
	where, msg, err := searchWhere(v)
	if msg != "" {
		s.badSearch(w, r, c, true, start, msg, err)
		return
	}
	id, err := uuid.Parse(v.Get("instance_id"))
	if err != nil {
		s.badSearch(w, r, c, true, start, "instance_id must be a run UUID.", err)
		return
	}
	ex, result := s.search.Explain(r.Context(), c, chroniclesdk.InstanceSearchQuery{Where: where}, id)
	serviceinstancesearch.WriteResult(w, r, result, true)
	if result.Err == nil {
		httpapi.Write(r.Context(), w, http.StatusOK, ex)
	}
}

func (*Service) searchFields(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, instancesearch.Describe())
}

// requestOrigin is the scheme and host the client used, so links in
// markdown point back at the same Chronicle community. The scheme is only
// ever http or https, whatever X-Forwarded-Proto says.
func requestOrigin(r *http.Request) string {
	scheme := "https"
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		first, _, _ := strings.Cut(proto, ",")
		if strings.EqualFold(strings.TrimSpace(first), "http") {
			scheme = "http"
		}
	} else if r.TLS == nil {
		scheme = "http"
	}
	return scheme + "://" + r.Host
}

// markdownCell makes uploader-controlled text (run, realm and guild names)
// inert inside a table cell or link text: backslash too, so `a\|b`
// can't unescape a pipe, plus the characters that start links, code or HTML.
var markdownCell = strings.NewReplacer(
	"\\", "\\\\", "|", `\|`, "[", `\[`, "]", `\]`, "`", "\\`", "<", `\<`, ">", `\>`,
	"\n", " ", "\r", " ",
)

// searchMarkdown renders a compact table for AI agents.
func searchMarkdown(r *http.Request, resp SearchResponse) string {
	origin := requestOrigin(r)
	var b strings.Builder
	if len(resp.Results) == 0 {
		b.WriteString("No runs match this search.\n")
	} else {
		b.WriteString("| Run | Date | Realm | Guild | Bosses killed |\n|---|---|---|---|---|\n")
		for _, res := range resp.Results {
			ref := res.Slug
			if ref == "" {
				ref = res.ID.String()
			}
			guild := res.GuildName
			if guild == "" {
				guild = "-"
			}
			_, _ = fmt.Fprintf(&b, "| [%s](%s) | %s | %s | %s | %d |\n",
				markdownCell.Replace(res.Name), aikey.Link(r.Context(), origin+"/instances/"+url.PathEscape(ref)), res.StartedAt.UTC().Format("2006-01-02"),
				markdownCell.Replace(res.RealmName), markdownCell.Replace(guild), res.BossesKilled)
		}
	}
	if resp.NextCursor != "" {
		next := r.URL.Query()
		next.Set("cursor", resp.NextCursor)
		_, _ = fmt.Fprintf(&b, "\n[Next page](%s)\n", aikey.Link(r.Context(), origin+r.URL.Path+"?"+next.Encode()))
	}
	return b.String()
}

func (s *Service) registerSearchRoutes() {
	whereParameters := []OpenAPIParameter{
		queryParameter("q", "Search text in the code editor's syntax, e.g. instance.name == \"Molten Core\" && instance.started_at >= timestamp(\"2026-10-01T00:00:00Z\"). Use q or where, not both; neither matches every run. Up to 4 KB, nested at most 32 levels. Anonymous callers may AND up to 6 filters on instance.name, realm, guild, started_at, difficulty and category.", false, "string", `instance.name == "Molten Core"`),
		queryParameter("where", "The search tree as JSON (the where of POST /api/v1/raidlogs/search), instead of q.", false, "string", `{"field":"instance.name","op":"=","value":"Molten Core"}`),
	}
	searchErrors := map[string]OpenAPIResponse{
		"400": {Description: "The search could not be read or compiled. detail gives the parse position or the compiler error."},
		"403": {Description: "The search uses something only logged-in users may use."},
	}
	withErrors := func(ok map[string]OpenAPIResponse, codes ...string) map[string]OpenAPIResponse {
		for _, code := range codes {
			ok[code] = searchErrors[code]
		}
		return ok
	}
	example := chroniclesdk.InstanceSearchResult{
		ID: uuid.MustParse("11111111-1111-1111-1111-111111111111"), Slug: "example-instance", Name: "Molten Core",
		RealmID: uuid.MustParse("22222222-2222-2222-2222-222222222222"), RealmName: "Example Realm", GuildName: "Example Guild",
		DifficultyName: "Normal", MaxPlayers: 40, StartedAt: time.Date(2026, time.October, 3, 19, 0, 0, 0, time.UTC),
		PlayerCount: 40, BossesKilled: 10,
	}

	matched := true
	exampleValue := example.StartedAt.Format(time.RFC3339)
	searchOK := okResponse(SearchResponse{
		Results:    []chroniclesdk.InstanceSearchResult{example},
		NextCursor: encodeSearchCursor(&chroniclesdk.InstanceSearchCursor{Value: &exampleValue, ID: example.ID, Sort: chroniclesdk.InstanceSearchSort{Field: chroniclesdk.InstanceSearchSortStartedAt, Direction: chroniclesdk.InstanceSearchSortDesc}}),
	})
	searchOK["200"].Content["text/markdown"] = OpenAPIMediaType{Example: "| Run | Date | Realm | Guild | Bosses killed |\n|---|---|---|---|---|\n| [Molten Core](https://chronicle.example/instances/example-instance) | 2026-10-03 | Example Realm | Example Guild | 10 |\n\n[Next page](https://chronicle.example/api/external/v1/raidlogs/search?cursor=...&format=md&q=...)\n"}
	s.register(http.MethodGet, "/raidlogs/search", OpenAPIOperation{
		Tags:    []string{"Search"},
		Summary: "Search raid runs",
		Description: "Runs an instance search, newest first by default. The search costs tokens from the caller IP's search bucket (Chronicle-Search-Cost and Chronicle-Search-Runtime-Cost headers; RateLimit-* headers report that bucket). " +
			"GET /raidlogs/search/fields lists the fields, operators and sorts. Set format=md for a compact markdown table with links and a next-page link.",
		Parameters: append(whereParameters,
			queryParameter("sort", "Sort property, e.g. instance.started_at or instance.bosses_killed. See /raidlogs/search/fields.", false, "string", "instance.started_at"),
			queryParameter("dir", "Sort direction: asc or desc", false, "string", "desc"),
			queryParameter("limit", "Page size, up to 25 without logging in", false, "integer", 25),
			queryParameter("cursor", "next_cursor from the previous page", false, "string", nil),
			queryParameter("format", "Response format: json (default) or md", false, "string", "json"),
		),
		Responses: withErrors(searchOK, "400", "403"),
	}, s.searchInstances)

	s.register(http.MethodGet, "/raidlogs/search/fields", OpenAPIOperation{
		Tags:        []string{"Search"},
		Summary:     "List search fields",
		Description: "Returns the search fields, operators, sorts, cost model and anonymous limits. Fields with anonymous: true may be used without logging in.",
		Responses: okResponse(chroniclesdk.InstanceSearchFieldsResponse{
			Fields: []chroniclesdk.InstanceSearchField{{
				Name: "instance.name", Scope: "instance", Type: "string", Ops: []chroniclesdk.InstanceSearchOp{"=", "!=", "in", "not_in", "contains", "starts_with"},
				Doc: "Zone name, e.g. Molten Core.", Anonymous: true, Cost: 1,
			}},
			MaxNodes: instancesearch.DefaultMaxNodes, MaxDepth: instancesearch.DefaultMaxDepth, AnonymousMaxPredicates: 6, AnonymousMaxLimit: 25,
		}),
	}, s.searchFields)

	s.register(http.MethodGet, "/raidlogs/search/explain", OpenAPIOperation{
		Tags:        []string{"Search"},
		Summary:     "Explain a search for one run",
		Description: "Shows why one run does or does not match a search, node by node. Takes the same q or where as /raidlogs/search and is charged to the same bucket.",
		Parameters: append(whereParameters,
			queryParameter("instance_id", "Run UUID", true, "string", "11111111-1111-1111-1111-111111111111"),
		),
		Responses: withErrors(okResponse(chroniclesdk.InstanceSearchExplainResponse{
			Matched: true,
			Evidence: &chroniclesdk.InstanceSearchEvidence{
				Kind: chroniclesdk.InstanceSearchEvidenceField, Field: "instance.name", OK: &matched, Value: "Molten Core",
			},
		}), "400", "403"),
	}, s.searchExplain)
}
