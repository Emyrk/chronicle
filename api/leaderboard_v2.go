package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardread"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

func (api *API) LeaderboardV2(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	bad := func(message string) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: message})
	}
	tenant := servicetenant.TenantFromContext(ctx)
	if tenant == nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Open a tenant site to view its leaderboard. Root ownership is not inferred."})
		return
	}
	q := r.URL.Query()
	// Never accept an arbitrary tenant, dataset, or version from public input.
	for _, key := range []string{"tenant", "tenant_id", "dataset", "projection_version", "algorithm_version"} {
		if q.Has(key) {
			bad("unsupported scope parameter: " + key)
			return
		}
	}
	size, err := strconv.ParseInt(q.Get("max_players"), 10, 16)
	if err != nil || size < 0 {
		bad("max_players must be a nonnegative integer")
		return
	}
	req := leaderboardread.Request{Instance: q.Get("instance"), Difficulty: q.Get("difficulty"), MaxPlayers: int16(size), Subject: q.Get("subject"), Kind: q.Get("kind"), Score: q.Get("score"), Boss: q.Get("boss"), Bosses: q["bosses"], Set: q.Get("set"), Class: q.Get("class"), Spec: q.Get("spec"), SubSpec: q.Get("sub_spec"), FilterSubSpec: q.Has("sub_spec"), Metric: q.Get("metric"), Search: strings.TrimSpace(q.Get("search"))}
	if q.Get("realm") != "" {
		req.Realm, err = uuid.Parse(q.Get("realm"))
		if err != nil {
			bad("invalid realm ID")
			return
		}
	}
	db := database.New(api.Opts.Pool)
	config, err := inspectLeaderboardConfiguration(ctx, db, tenant)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if config.Conflict != "" {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: config.Conflict})
		return
	}
	rows := make([]database.ResolveLeaderboardConfigurationRow, 0, len(config.Rows))
	for _, row := range config.Rows {
		rows = append(rows, database.ResolveLeaderboardConfigurationRow{Kind: row.Kind, InstanceName: row.InstanceName, EncounterName: row.EncounterName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, SetKey: row.SetKey, HasPoints: row.HasPoints, Points: row.Points})
	}
	// Cohort discovery validates the same instance/variant, using set-independent
	// enabled bosses. The discovery response itself does not produce Renown scores.
	selectionReq := req
	if q.Get("view") == "cohorts" {
		selectionReq.Subject = "player"
		selectionReq.Kind = "renown"
		selectionReq.Score = "renown"
		selectionReq.Class = ""
		selectionReq.Spec = ""
		selectionReq.SubSpec = ""
		selectionReq.Metric = ""
		selectionReq.Boss = ""
		selectionReq.Bosses = nil
		selectionReq.Set = ""
	}
	selection, err := leaderboardread.Select(rows, selectionReq)
	if err != nil {
		bad(err.Error())
		return
	}
	if q.Get("view") == "cohorts" {
		cohorts, err := db.ListLeaderboardV2Cohorts(ctx, database.ListLeaderboardV2CohortsParams{TenantID: tenant.ID, InstanceName: req.Instance, DifficultyName: req.Difficulty, MaxPlayers: req.MaxPlayers, Bosses: selection.Bosses})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		out := []chroniclesdk.LeaderboardV2Cohort{}
		for _, c := range cohorts {
			out = append(out, chroniclesdk.LeaderboardV2Cohort{PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric})
		}
		httpapi.Write(ctx, w, http.StatusOK, out)
		return
	}
	out := chroniclesdk.LeaderboardV2Response{Status: "ready", Entries: []chroniclesdk.LeaderboardV2Entry{}, IncludedBosses: selection.Bosses}
	fingerprint := leaderboardread.Fingerprint(tenant.ID, req, selection)
	var cursor leaderboardread.Cursor
	if q.Get("cursor") != "" {
		cursor, err = leaderboardread.DecodeCursor(q.Get("cursor"), fingerprint)
		if err != nil {
			bad(err.Error())
			return
		}
	}
	if selection.Denominator == 0 || (req.Kind == "renown" && len(selection.Bosses) == 0) {
		out.Status = "empty_selection"
		out.Message = "This enabled selection contains no eligible bosses."
		httpapi.Write(ctx, w, http.StatusOK, out)
		return
	}
	limit := int32(50)
	if q.Has("limit") {
		n, err := strconv.ParseInt(q.Get("limit"), 10, 32)
		if err != nil || n < 1 || n > 50 {
			bad("limit must be between 1 and 50")
			return
		}
		limit = int32(n)
	}
	result, err := db.ListLeaderboardV2(ctx, database.ListLeaderboardV2Params{
		TenantID: tenant.ID, InstanceName: req.Instance, DifficultyName: req.Difficulty, MaxPlayers: req.MaxPlayers,
		SubjectKind: req.Subject, BoardKind: req.Kind, ScoreMetric: req.Score, PlayerClass: req.Class, PlayerSpec: req.Spec, PlayerSubSpec: req.SubSpec, FilterSubSpec: req.FilterSubSpec, Metric: req.Metric,
		Bosses: selection.Bosses, Awards: selection.Awards, Denominator: selection.Denominator, RealmFilter: req.Realm, Search: req.Search,
		PageSize: limit + 1, HasCursor: q.Get("cursor") != "", AfterScore: cursor.Score, AfterRealm: cursor.Realm, AfterSubject: cursor.Subject, AfterClass: cursor.Class, AfterSpec: cursor.Spec, AfterSubSpec: cursor.SubSpec,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	more := len(result) > int(limit)
	if more {
		result = result[:limit]
	}
	for _, row := range result {
		out.Entries = append(out.Entries, chroniclesdk.LeaderboardV2Entry{RealmID: row.RealmID, SubjectID: row.SubjectID, PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec, Name: row.SubjectName, Score: row.Score, Peak: row.Peak, Mastery: row.Mastery, Renown: row.Renown, SampleCount: row.SampleCount, ComputedAt: row.ComputedAt.Time})
	}
	if more {
		last := result[len(result)-1]
		out.NextCursor = leaderboardread.EncodeCursor(leaderboardread.Cursor{Fingerprint: fingerprint, Score: last.Score, Realm: last.RealmID, Subject: last.SubjectID, Class: last.PlayerClass, Spec: last.PlayerSpec, SubSpec: last.PlayerSubSpec})
	}
	if len(out.Entries) == 0 {
		out.Status = "empty"
		out.Message = "No summaries match this selection. The preview does not populate or refresh evidence."
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}
