package servicerankings

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type hubSetBoardInput struct {
	params database.HubSetBoardPageParams
	page   int32
}

// parseHubSetBoardInput validates one chosen-boss board page request. The URL is
// the cache key, so only known parameters are accepted.
func parseHubSetBoardInput(r *http.Request) (hubSetBoardInput, error) {
	q := r.URL.Query()
	for key, values := range q {
		switch key {
		case "instance_name", "encounter_names", "difficulty_name", "max_players", "performance_metric", "class", "spec", "sub_spec",
			"realm_ids", "window", "subject", "rating_metric", "query", "page", "limit":
		default:
			return hubSetBoardInput{}, errors.New("unknown parameter: " + key)
		}
		if len(values) != 1 {
			return hubSetBoardInput{}, errors.New(key + " must appear once")
		}
	}
	p := database.HubSetBoardPageParams{InstanceName: q.Get("instance_name"), DifficultyName: q.Get("difficulty_name"),
		PerformanceMetric: q.Get("performance_metric"), PlayerSpec: q.Get("spec"), PlayerSubSpec: q.Get("sub_spec"),
		Subject: q.Get("subject"), SearchQuery: strings.TrimSpace(q.Get("query"))}
	if strings.TrimSpace(p.InstanceName) == "" {
		return hubSetBoardInput{}, errors.New("instance_name is required")
	}
	seen := map[string]bool{}
	for _, name := range strings.Split(q.Get("encounter_names"), ",") {
		if name = strings.TrimSpace(name); name != "" && !seen[name] {
			seen[name] = true
			p.EncounterNames = append(p.EncounterNames, name)
		}
	}
	if len(p.EncounterNames) == 0 || len(p.EncounterNames) > 64 {
		return hubSetBoardInput{}, errors.New("encounter_names must list 1 to 64 bosses")
	}
	if !q.Has("difficulty_name") || !q.Has("max_players") {
		return hubSetBoardInput{}, errors.New("difficulty_name and max_players are required")
	}
	size, err := strconv.ParseInt(q.Get("max_players"), 10, 16)
	if err != nil || size < 0 {
		return hubSetBoardInput{}, errors.New("invalid max_players")
	}
	p.MaxPlayers = int16(size)
	switch q.Get("rating_metric") {
	case "peak":
		p.RatingMetric = "peak"
	case "mastery", "ranked_mastery":
		p.RatingMetric = "ranked_mastery"
	case "renown":
		p.RatingMetric = "renown"
	default:
		return hubSetBoardInput{}, errors.New("rating_metric must be peak, mastery, or renown")
	}
	switch q.Get("window") {
	case "", "period":
		p.WindowKind, p.RenownWindow = "period", "period"
	case "all":
		p.WindowKind, p.RenownWindow = "all_time", "career"
	default:
		return hubSetBoardInput{}, errors.New("window must be period or all")
	}
	if p.Subject != "player" && p.Subject != "guild" {
		return hubSetBoardInput{}, errors.New("subject must be player or guild")
	}
	if p.PerformanceMetric != "dps" && p.PerformanceMetric != "hps" {
		return hubSetBoardInput{}, errors.New("performance_metric must be dps or hps")
	}
	if p.Subject == "guild" && (q.Get("class") != "" || p.PlayerSpec != "" || p.PlayerSubSpec != "") {
		return hubSetBoardInput{}, errors.New("guild boards have no class or spec")
	}
	if (p.PlayerSpec != "" && q.Get("class") == "") || (p.PlayerSubSpec != "" && p.PlayerSpec == "") {
		return hubSetBoardInput{}, errors.New("spec needs a class and sub_spec needs a spec")
	}
	p.PlayerClass = hubClassFilter(q.Get("class"))
	if len(p.SearchQuery) > 200 {
		return hubSetBoardInput{}, errors.New("query must be at most 200 bytes")
	}
	if q.Has("realm_ids") {
		for _, part := range strings.Split(q.Get("realm_ids"), ",") {
			id, err := uuid.Parse(strings.TrimSpace(part))
			if err != nil || id == uuid.Nil {
				return hubSetBoardInput{}, errors.New("invalid realm_ids")
			}
			p.RealmIds = append(p.RealmIds, id)
		}
		if len(p.RealmIds) > 64 {
			return hubSetBoardInput{}, errors.New("too many realm_ids")
		}
	}
	limit, page := int64(50), int64(0)
	if q.Has("limit") {
		// Guild boards are small and sorted and searched in the browser: up to 500.
		maxLimit := int64(100)
		if p.Subject == "guild" {
			maxLimit = 500
		}
		if limit, err = strconv.ParseInt(q.Get("limit"), 10, 32); err != nil || limit < 1 || limit > maxLimit {
			return hubSetBoardInput{}, errors.New("limit is too large for this board")
		}
	}
	if q.Has("page") {
		if page, err = strconv.ParseInt(q.Get("page"), 10, 32); err != nil || page < 0 || page > 100000 {
			return hubSetBoardInput{}, errors.New("invalid page")
		}
	}
	// Fetch one extra row to know whether a next page exists.
	p.LimitCount, p.OffsetCount = int32(limit)+1, int32(page*limit)
	return hubSetBoardInput{params: p, page: int32(page)}, nil
}

// handleHubSetBoard serves one page of a chosen-boss rating board.
//
//	GET /ratings/set-board?instance_name=Molten+Core&encounter_names=Lucifron,Ragnaros&...
func (s *Service) handleHubSetBoard(w http.ResponseWriter, r *http.Request) {
	in, err := parseHubSetBoardInput(r)
	if err != nil {
		tenantRatingBad(w, r, err.Error())
		return
	}
	ctx := r.Context()
	tenant := servicetenant.TenantIDFromContext(ctx)
	out := chroniclesdk.HubSetBoardResponse{Rows: []chroniclesdk.HubSetBoardRow{}, Page: int(in.page)}
	generation, err := s.store.GetActiveTenantRatingGeneration(ctx, tenant)
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows) || (err == nil && generation == uuid.Nil) {
		httpapi.Write(ctx, w, http.StatusOK, out)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	in.params.TenantID, in.params.GenerationID = tenant, generation
	rows, err := s.store.HubSetBoardPage(ctx, in.params)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	limit := int(in.params.LimitCount) - 1
	if len(rows) > limit {
		out.HasNextPage = true
		rows = rows[:limit]
	}
	for _, v := range rows {
		out.Total = v.Total
		row := chroniclesdk.HubSetBoardRow{Rank: v.Rank, RealmID: v.RealmID, RealmName: v.RealmName,
			SubjectID: v.SubjectID, Name: v.SubjectName, GuildName: v.GuildName, PlayerClass: normalizeClassName(v.PlayerClass),
			PlayerSpec: v.PlayerSpec, PlayerSubSpec: v.PlayerSubSpec, Score: v.Score, Peak: v.Peak, Mastery: v.Mastery,
			Renown: v.Renown, PeakRaw: hubPeakRaw(v.PeakRaw)}
		if v.EligibleKills > 0 {
			row.MasteryParts = &chroniclesdk.HubSetBoardMastery{Peak: v.MasteryPeak, Form: v.MasteryForm, Floor: v.MasteryFloor, EligibleKills: v.EligibleKills}
		}
		out.Rows = append(out.Rows, row)
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}
