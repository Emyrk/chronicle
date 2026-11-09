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
	req.CompanionMetric = q.Get("companion_metric")
	req.CompanionClass = q.Get("companion_class")
	req.CompanionSpec = q.Get("companion_spec")
	req.CompanionSubSpec = q.Get("companion_sub_spec")
	req.CompanionFilterSubSpec = q.Has("companion_sub_spec")

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
	rows := selectionRows(config)
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
		selectionReq.FilterSubSpec = false
		selectionReq.Metric = ""
		selectionReq.Boss = ""
		selectionReq.Bosses = nil
		selectionReq.Set = ""
		for _, row := range rows {
			if row.Kind == "boss" && row.InstanceName == req.Instance {
				selectionReq.Bosses = append(selectionReq.Bosses, row.EncounterName)
			}
		}
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
	operations, err := db.ActiveLeaderboardOperation(ctx, tenant.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if len(operations) > 0 {
		out.Maintenance = operationMaintenance(operations[0])
	}

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
		out.Entries = append(out.Entries, chroniclesdk.LeaderboardV2Entry{RealmID: row.RealmID, RealmName: row.RealmName, SubjectID: row.SubjectID, PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec, Name: row.SubjectName, SubjectClass: row.SubjectClass, Score: row.Score, Peak: row.Peak, Form: row.Form, Floor: row.Floor, Bosses: []chroniclesdk.LeaderboardV2Boss{}, Mastery: row.Mastery, Renown: row.Renown, SampleCount: row.SampleCount, ComputedAt: row.ComputedAt.Time})
	}
	// Enrich only the actual returned page, not the look-ahead row or all candidates.
	if (req.Kind == "boss" || (req.Kind == "renown" && req.Subject == "guild")) && len(out.Entries) > 0 {
		details := database.ListLeaderboardV2PageBossesParams{TenantID: tenant.ID, InstanceName: req.Instance, DifficultyName: req.Difficulty, MaxPlayers: req.MaxPlayers, Metric: req.Metric, SubjectKind: req.Subject, Bosses: selection.Bosses}
		type identity struct {
			Realm                         uuid.UUID
			Subject, Class, Spec, SubSpec string
		}
		indexes := make(map[identity]int, len(out.Entries))
		for i, entry := range out.Entries {
			details.Realms = append(details.Realms, entry.RealmID)
			details.Subjects = append(details.Subjects, entry.SubjectID)
			details.Classes = append(details.Classes, entry.PlayerClass)
			details.Specs = append(details.Specs, entry.PlayerSpec)
			details.SubSpecs = append(details.SubSpecs, entry.PlayerSubSpec)
			indexes[identity{entry.RealmID, entry.SubjectID, entry.PlayerClass, entry.PlayerSpec, entry.PlayerSubSpec}] = i
		}
		bosses, err := db.ListLeaderboardV2PageBosses(ctx, details)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		for _, boss := range bosses {
			i, ok := indexes[identity{boss.RealmID, boss.SubjectID, boss.PlayerClass, boss.PlayerSpec, boss.PlayerSubSpec}]
			if !ok {
				continue
			}
			detail := chroniclesdk.LeaderboardV2Boss{EncounterName: boss.EncounterName, Peak: boss.Peak, ObservationCount: boss.ObservationCount}
			if req.Subject == "player" && boss.ObservationCount > 0 {
				detail.RawPeak = &boss.RawPeak
			}
			if boss.DurationMs > 0 {
				detail.DurationMS = &boss.DurationMs
			}
			if req.Kind == "renown" {
				denominator := float64(len(selection.Bosses))
				out.Entries[i].Peak += boss.Peak / denominator
				out.Entries[i].Form += boss.Form / denominator
				out.Entries[i].Floor += boss.Floor / denominator
				out.Entries[i].Mastery += (.3*boss.Peak + .5*boss.Form + .2*boss.Floor) / denominator
			}
			out.Entries[i].Bosses = append(out.Entries[i].Bosses, detail)
		}
	}
	if req.Kind == "renown" && req.Subject == "guild" {
		for i, entry := range out.Entries {
			for _, boss := range entry.Bosses {
				if boss.ObservationCount > 0 {
					out.Entries[i].PeakCompanion = &chroniclesdk.LeaderboardV2Companion{Score: entry.Peak}
					out.Entries[i].MasteryCompanion = &chroniclesdk.LeaderboardV2Companion{Score: entry.Mastery}
					break
				}
			}
		}
	}
	if req.Kind == "boss" && len(out.Entries) > 0 {
		params := database.ListLeaderboardV2PageRenownParams{TenantID: tenant.ID, InstanceName: req.Instance, DifficultyName: req.Difficulty, MaxPlayers: req.MaxPlayers, SubjectKind: req.Subject, Bosses: selection.Bosses, Awards: selection.Awards}
		for _, entry := range out.Entries {
			params.Realms = append(params.Realms, entry.RealmID)
			params.Subjects = append(params.Subjects, entry.SubjectID)
		}
		companions, err := db.ListLeaderboardV2PageRenown(ctx, params)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		for _, companion := range companions {
			for i, entry := range out.Entries {
				if entry.RealmID == companion.RealmID && entry.SubjectID == companion.SubjectID {
					out.Entries[i].Renown = companion.Renown
				}
			}
		}
	}
	if req.Kind == "renown" && req.Subject == "player" && req.CompanionMetric != "" && len(out.Entries) > 0 {
		params := database.ListLeaderboardV2PlayerCompanionsParams{TenantID: tenant.ID, InstanceName: req.Instance, DifficultyName: req.Difficulty, MaxPlayers: req.MaxPlayers, Metric: req.CompanionMetric, PlayerClass: req.CompanionClass, PlayerSpec: req.CompanionSpec, PlayerSubSpec: req.CompanionSubSpec, FilterSubSpec: req.CompanionFilterSubSpec, Bosses: selection.Bosses, Denominator: int32(len(selection.Bosses))}
		for _, entry := range out.Entries {
			params.Realms = append(params.Realms, entry.RealmID)
			params.Subjects = append(params.Subjects, entry.SubjectID)
		}
		companions, err := db.ListLeaderboardV2PlayerCompanions(ctx, params)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		for _, companion := range companions {
			for i, entry := range out.Entries {
				if entry.RealmID == companion.RealmID && entry.SubjectID == companion.SubjectID {
					value := &chroniclesdk.LeaderboardV2Companion{Score: companion.Score, PlayerClass: companion.PlayerClass, PlayerSpec: companion.PlayerSpec, PlayerSubSpec: companion.PlayerSubSpec}
					if companion.Metric == "peak" {
						out.Entries[i].PeakCompanion = value
					} else {
						out.Entries[i].MasteryCompanion = value
					}
				}
			}
		}
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

// playerHistoryLimit bounds one response; it matches the query's LIMIT.
const playerHistoryLimit = 5000

// LeaderboardV2PlayerHistory returns one character's canonical kills grouped by
// exact boss and cohort, with the current benchmark and Renown award. Bosses or
// variants that are not enabled for the tenant's boards are omitted.
func (api *API) LeaderboardV2PlayerHistory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenant := servicetenant.TenantFromContext(ctx)
	if tenant == nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Open a tenant site to view rating history."})
		return
	}
	q := r.URL.Query()
	realm, err := uuid.Parse(q.Get("realm"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid realm ID"})
		return
	}
	player := strings.TrimSpace(q.Get("player"))
	if player == "" || len(player) > 64 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "player is required"})
		return
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
	rows, err := db.ListLeaderboardV2PlayerHistory(ctx, database.ListLeaderboardV2PlayerHistoryParams{TenantID: tenant.ID, RealmID: realm, PlayerGuid: player})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, buildPlayerHistory(selectionRows(config), rows))
}

func buildPlayerHistory(config []database.ResolveLeaderboardConfigurationRow, rows []database.ListLeaderboardV2PlayerHistoryRow) chroniclesdk.LeaderboardV2PlayerHistory {
	out := chroniclesdk.LeaderboardV2PlayerHistory{Groups: []chroniclesdk.LeaderboardV2PlayerHistoryGroup{}, Truncated: len(rows) >= playerHistoryLimit}
	type boss struct {
		Instance, Difficulty, Encounter string
		MaxPlayers                      int16
	}
	type award struct {
		points float64
		ok     bool
	}
	awards := map[boss]award{}
	kills := map[boss]int64{}
	for _, row := range rows {
		kills[boss{row.InstanceName, row.DifficultyName, row.EncounterName, row.MaxPlayers}]++
	}
	for _, row := range rows {
		key := boss{row.InstanceName, row.DifficultyName, row.EncounterName, row.MaxPlayers}
		a, seen := awards[key]
		if !seen {
			// The same resolution the Renown board uses for a single exact boss.
			selection, err := leaderboardread.Select(config, leaderboardread.Request{Instance: row.InstanceName, Difficulty: row.DifficultyName, MaxPlayers: row.MaxPlayers, Subject: "player", Kind: "renown", Score: "renown", Boss: row.EncounterName})
			a = award{ok: err == nil && len(selection.Awards) == 1}
			if a.ok {
				a.points = selection.Awards[0]
			}
			awards[key] = a
		}
		if !a.ok {
			continue
		}
		n := len(out.Groups)
		if n == 0 || !sameHistoryGroup(out.Groups[n-1], row) {
			out.Groups = append(out.Groups, chroniclesdk.LeaderboardV2PlayerHistoryGroup{
				InstanceName: row.InstanceName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, EncounterName: row.EncounterName,
				PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec, Metric: row.Metric,
				Benchmark: row.BestMetric, RenownAward: a.points, RenownKills: kills[key], Kills: []chroniclesdk.LeaderboardV2PlayerHistoryKill{},
			})
			n++
		}
		kill := chroniclesdk.LeaderboardV2PlayerHistoryKill{KilledAt: row.KilledAt.Time, Value: row.MetricValue}
		if row.HasParse {
			parse := row.Parse
			kill.Parse = &parse
		}
		out.Groups[n-1].Kills = append(out.Groups[n-1].Kills, kill)
	}
	return out
}

// sameHistoryGroup relies on the query ordering rows by group identity.
func sameHistoryGroup(g chroniclesdk.LeaderboardV2PlayerHistoryGroup, row database.ListLeaderboardV2PlayerHistoryRow) bool {
	return g.InstanceName == row.InstanceName && g.DifficultyName == row.DifficultyName && g.MaxPlayers == row.MaxPlayers &&
		g.EncounterName == row.EncounterName && g.PlayerClass == row.PlayerClass && g.PlayerSpec == row.PlayerSpec &&
		g.PlayerSubSpec == row.PlayerSubSpec && g.Metric == row.Metric
}

func selectionRows(config chroniclesdk.LeaderboardConfiguration) []database.ResolveLeaderboardConfigurationRow {
	rows := make([]database.ResolveLeaderboardConfigurationRow, 0, len(config.Rows))
	for _, row := range config.Rows {
		rows = append(rows, database.ResolveLeaderboardConfigurationRow{Kind: row.Kind, InstanceName: row.InstanceName, EncounterName: row.EncounterName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, SetKey: row.SetKey, HasPoints: row.HasPoints, Points: row.Points})
	}
	return rows
}
