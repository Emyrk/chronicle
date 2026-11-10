package api

import (
	"cmp"
	"context"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const (
	careerBoardDefaultLimit = 100
	careerBoardMaxLimit     = 250
)

// LeaderboardCareer ranks characters or guilds by career Mastery, Peak, and
// Renown in one response. It computes on every request; the response is cached
// at the edge.
//
// Query: subject=characters|guilds, metric=dps|hps (characters; default each
// spec's chosen metric), class, spec, sub_spec (characters), raid (repeatable,
// `Instance|Difficulty|MaxPlayers` from raid_options; default every raid),
// realm, search (name contains), offset, and limit (per board).
func (api *API) LeaderboardCareer(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	tenant := servicetenant.TenantFromContext(ctx)
	if tenant == nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Open a tenant site to view career ratings."})
		return
	}
	q := r.URL.Query()
	bad := func(msg string) { httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: msg}) }
	var filter serviceratings.CareerBoardFilter
	switch q.Get("subject") {
	case "", "characters":
	case "guilds":
		filter.Guilds = true
	default:
		bad("subject must be characters or guilds")
		return
	}
	filter.Metric = q.Get("metric")
	if filter.Metric != "" && filter.Metric != "dps" && filter.Metric != "hps" {
		bad("metric must be dps or hps")
		return
	}
	filter.Class, filter.Spec, filter.SubSpec = q.Get("class"), q.Get("spec"), q.Get("sub_spec")
	if filter.Guilds && (filter.Metric != "" || filter.Class != "" || filter.Spec != "" || filter.SubSpec != "") {
		bad("Guild career ratings use kill time and do not split by class, spec, or metric.")
		return
	}
	limit := careerBoardDefaultLimit
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > careerBoardMaxLimit {
			bad("limit must be between 1 and 250")
			return
		}
		limit = n
	}
	offset := 0
	if raw := q.Get("offset"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			bad("offset must be zero or more")
			return
		}
		offset = n
	}
	search := strings.TrimSpace(q.Get("search"))
	for _, raw := range q["raid"] {
		key, ok := parseCareerRaidKey(raw)
		if !ok {
			bad("raid must be Instance|Difficulty|MaxPlayers")
			return
		}
		filter.Raids = append(filter.Raids, key)
	}
	db := database.New(api.Opts.Pool)
	if raw := q.Get("realm"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil || id == uuid.Nil {
			bad("Invalid realm ID")
			return
		}
		if err := careerRealmOwnership(ctx, db, tenant.ID, id); err != nil {
			writeCareerError(w, r, err)
			return
		}
		filter.Realm = id
	}

	board, err := serviceratings.ReadCareerBoard(ctx, db, tenant.ID, filter)
	if err != nil {
		writeCareerError(w, r, err)
		return
	}
	entries := board.Entries
	if search != "" {
		entries, err = careerBoardSearch(ctx, db, filter, search, entries)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}
	// Ranks are computed before the page; search narrows the ranking itself.
	totals := map[string]int{}
	ranked := map[string][]serviceratings.CareerBoardEntry{}
	var shown []serviceratings.CareerBoardEntry
	for _, sort := range serviceratings.CareerBoardSorts {
		all := serviceratings.RankCareerBoard(entries, sort)
		totals[sort] = len(all)
		ranked[sort] = all[min(offset, len(all)):min(offset+limit, len(all))]
		shown = append(shown, ranked[sort]...)
	}
	names, err := serviceratings.CareerBoardNames(ctx, db, filter.Guilds, shown)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	page := func(sort string) chroniclesdk.CareerLeaderboardBoard {
		out := chroniclesdk.CareerLeaderboardBoard{Total: totals[sort], Entries: []chroniclesdk.CareerLeaderboardEntry{}}
		for _, e := range ranked[sort] {
			name := names[serviceratings.CareerSubjectKey{Realm: e.RealmID, ID: e.SubjectID}]
			entry := chroniclesdk.CareerLeaderboardEntry{
				SubjectID: e.SubjectID, Name: cmp.Or(name.Name, e.SubjectID),
				RealmID: e.RealmID.String(), RealmName: name.RealmName,
				PlayerClass: cmp.Or(e.PlayerClass, name.PlayerClass), GuildName: name.GuildName, LogoURL: name.LogoURL,
			}
			entry.PlayerSpec, entry.PlayerSubSpec, entry.ChosenMetric = e.PlayerSpec, e.PlayerSubSpec, e.ChosenMetric
			entry.Mastery, entry.Peak, entry.Renown = e.Mastery, e.Peak, e.Renown
			entry.Form, entry.Floor = e.Form, e.Floor
			entry.Raids = careerBoardRaids(e)
			out.Entries = append(out.Entries, entry)
		}
		return out
	}
	options := make([]chroniclesdk.CareerLeaderboardRaidOption, 0, len(board.Raids))
	for _, r := range board.Raids {
		options = append(options, chroniclesdk.CareerLeaderboardRaidOption{
			Key: careerRaidKey(r.CareerKey), InstanceName: r.Instance, DifficultyName: r.Difficulty, MaxPlayers: int(r.MaxPlayers),
			Weight: r.Weight, IncludeAverage: r.IncludeAverage, IncludeRenown: r.IncludeRenown,
		})
	}
	writeCacheableLeaderboardResponse(ctx, w, http.StatusOK, chroniclesdk.CareerLeaderboardResponse{
		Status: board.Status, Mastery: page("mastery"), Peak: page("peak"), Renown: page("renown"), RaidOptions: options,
	})
}

// careerRaidKey is a raid's `raid` query value: Instance|Difficulty|MaxPlayers.
func careerRaidKey(k leaderboardconfig.CareerKey) string {
	return k.Instance + "|" + k.Difficulty + "|" + strconv.Itoa(int(k.MaxPlayers))
}

func parseCareerRaidKey(raw string) (leaderboardconfig.CareerKey, bool) {
	parts := strings.Split(raw, "|")
	if len(parts) != 3 || strings.TrimSpace(parts[0]) == "" {
		return leaderboardconfig.CareerKey{}, false
	}
	size, err := strconv.ParseInt(parts[2], 10, 16)
	if err != nil || size < 0 {
		return leaderboardconfig.CareerKey{}, false
	}
	return leaderboardconfig.CareerKey{Instance: parts[0], Difficulty: parts[1], MaxPlayers: int16(size)}, true
}

// careerBoardSearch keeps subjects whose name contains the search text.
func careerBoardSearch(ctx context.Context, db database.Store, filter serviceratings.CareerBoardFilter, search string, entries []serviceratings.CareerBoardEntry) ([]serviceratings.CareerBoardEntry, error) {
	match := map[serviceratings.CareerSubjectKey]bool{}
	if filter.Guilds {
		rows, err := db.SearchLeaderboardCareerGuilds(ctx, database.SearchLeaderboardCareerGuildsParams{Search: search, RealmFilter: filter.Realm})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			match[serviceratings.CareerSubjectKey{Realm: row.RealmID, ID: row.SubjectID}] = true
		}
	} else {
		rows, err := db.SearchLeaderboardCareerPlayers(ctx, database.SearchLeaderboardCareerPlayersParams{Search: search, RealmFilter: filter.Realm})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			match[serviceratings.CareerSubjectKey{Realm: row.RealmID, ID: row.SubjectID}] = true
		}
	}
	out := make([]serviceratings.CareerBoardEntry, 0, len(match))
	for _, e := range entries {
		if match[serviceratings.CareerSubjectKey{Realm: e.RealmID, ID: e.SubjectID}] {
			out = append(out, e)
		}
	}
	return out, nil
}

// careerBoardRaids lists the weighted raids behind Mastery and Peak, heaviest first.
func careerBoardRaids(e serviceratings.CareerBoardEntry) []chroniclesdk.CareerLeaderboardRaid {
	out := []chroniclesdk.CareerLeaderboardRaid{}
	if e.Mastery == nil {
		return out
	}
	for _, c := range e.Contributions {
		if !c.IncludeAverage || c.Weight == nil {
			continue
		}
		raid := chroniclesdk.CareerLeaderboardRaid{
			InstanceName: c.Instance, DifficultyName: c.Difficulty, MaxPlayers: int(c.MaxPlayers),
			Weight: *c.Weight, Mastery: c.Mastery, Peak: c.Peak, Kills: c.EligibleMetricKills,
			Bosses: []chroniclesdk.CareerLeaderboardRaidBoss{},
		}
		if c.Parts {
			form, floor := c.Form, c.Floor
			raid.Form, raid.Floor = &form, &floor
			counts := map[string]int64{}
			for _, b := range c.BossCounts {
				counts[b.Boss] += b.Count
			}
			for _, boss := range c.AverageBosses {
				raid.Bosses = append(raid.Bosses, chroniclesdk.CareerLeaderboardRaidBoss{EncounterName: boss, Count: counts[boss]})
			}
		}
		out = append(out, raid)
	}
	slices.SortStableFunc(out, func(a, b chroniclesdk.CareerLeaderboardRaid) int {
		return cmp.Or(cmp.Compare(b.Weight, a.Weight), cmp.Compare(a.InstanceName, b.InstanceName))
	})
	return out
}

