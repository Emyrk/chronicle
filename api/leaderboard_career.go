package api

import (
	"cmp"
	"context"
	"net/http"
	"slices"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
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
// spec's chosen metric), class, spec, sub_spec (characters), realm, limit.
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
	ranked := map[string][]serviceratings.CareerBoardEntry{}
	for _, sort := range []string{"mastery", "peak", "renown"} {
		entries := rankCareerBoard(board.Entries, sort)
		ranked[sort] = entries[:min(limit, len(entries))]
	}
	names, err := careerBoardNames(ctx, db, filter.Guilds, ranked)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	page := func(sort string) chroniclesdk.CareerLeaderboardBoard {
		out := chroniclesdk.CareerLeaderboardBoard{Total: len(rankCareerBoard(board.Entries, sort)), Entries: []chroniclesdk.CareerLeaderboardEntry{}}
		for _, e := range ranked[sort] {
			entry := names[careerNameKey{e.RealmID, e.SubjectID}]
			entry.SubjectID, entry.RealmID = e.SubjectID, e.RealmID.String()
			entry.Name = cmp.Or(entry.Name, e.SubjectID)
			entry.PlayerClass = cmp.Or(e.PlayerClass, entry.PlayerClass)
			entry.PlayerSpec, entry.PlayerSubSpec, entry.ChosenMetric = e.PlayerSpec, e.PlayerSubSpec, e.ChosenMetric
			entry.Mastery, entry.Peak, entry.Renown = e.Mastery, e.Peak, e.Renown
			entry.Form, entry.Floor, entry.BossesKilled, entry.Bosses = e.Form, e.Floor, e.BossesKilled, e.Bosses
			entry.Raids = careerBoardRaids(e)
			out.Entries = append(out.Entries, entry)
		}
		return out
	}
	writeCacheableLeaderboardResponse(ctx, w, http.StatusOK, chroniclesdk.CareerLeaderboardResponse{
		Status: board.Status, Mastery: page("mastery"), Peak: page("peak"), Renown: page("renown"),
	})
}

type careerNameKey struct {
	realm uuid.UUID
	id    string
}

// careerBoardNames looks up display names once for every subject shown on any board.
func careerBoardNames(ctx context.Context, db database.Store, guilds bool, ranked map[string][]serviceratings.CareerBoardEntry) (map[careerNameKey]chroniclesdk.CareerLeaderboardEntry, error) {
	out := map[careerNameKey]chroniclesdk.CareerLeaderboardEntry{}
	seen := map[careerNameKey]bool{}
	var realms []uuid.UUID
	var ids []string
	var guildIDs []uuid.UUID
	for _, entries := range ranked {
		for _, e := range entries {
			k := careerNameKey{e.RealmID, e.SubjectID}
			if seen[k] {
				continue
			}
			seen[k] = true
			if guilds {
				if id, err := uuid.Parse(e.SubjectID); err == nil {
					guildIDs = append(guildIDs, id)
				}
				continue
			}
			realms, ids = append(realms, e.RealmID), append(ids, e.SubjectID)
		}
	}
	if guilds {
		if len(guildIDs) == 0 {
			return out, nil
		}
		rows, err := db.ListLeaderboardCareerGuildNames(ctx, guildIDs)
		if err != nil {
			return nil, err
		}
		byID := map[string]database.ListLeaderboardCareerGuildNamesRow{}
		for _, row := range rows {
			byID[row.ID.String()] = row
		}
		for k := range seen {
			if row, ok := byID[k.id]; ok {
				out[k] = chroniclesdk.CareerLeaderboardEntry{Name: row.Name, RealmName: row.RealmName, LogoURL: row.LogoUrl}
			}
		}
		return out, nil
	}
	if len(realms) == 0 {
		return out, nil
	}
	rows, err := db.ListLeaderboardCareerPlayerNames(ctx, database.ListLeaderboardCareerPlayerNamesParams{RealmIds: realms, SubjectIds: ids})
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[careerNameKey{row.RealmID, row.SubjectID}] = chroniclesdk.CareerLeaderboardEntry{
			Name: row.PlayerName, RealmName: row.RealmName, PlayerClass: row.PlayerClass, GuildName: row.GuildName,
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
			Weight: *c.Weight, Mastery: c.Mastery, Peak: c.Peak, Kills: c.EligibleMetricKills, Bosses: c.Bosses,
		}
		if c.Parts {
			form, floor, killed := c.Form, c.Floor, c.BossesKilled
			raid.Form, raid.Floor, raid.BossesKilled = &form, &floor, &killed
		}
		out = append(out, raid)
	}
	slices.SortStableFunc(out, func(a, b chroniclesdk.CareerLeaderboardRaid) int {
		return cmp.Or(cmp.Compare(b.Weight, a.Weight), cmp.Compare(a.InstanceName, b.InstanceName))
	})
	return out
}

// rankCareerBoard keeps subjects that have the sorted value and orders them
// best first, breaking ties by identity so pages are stable.
func rankCareerBoard(entries []serviceratings.CareerBoardEntry, sort string) []serviceratings.CareerBoardEntry {
	value := func(e serviceratings.CareerBoardEntry) (float64, bool) {
		switch sort {
		case "peak":
			if e.Peak == nil {
				return 0, false
			}
			return *e.Peak, true
		case "renown":
			return e.Renown, e.Renown > 0
		default:
			if e.Mastery == nil {
				return 0, false
			}
			return *e.Mastery, true
		}
	}
	out := make([]serviceratings.CareerBoardEntry, 0, len(entries))
	for _, e := range entries {
		if _, ok := value(e); ok {
			out = append(out, e)
		}
	}
	slices.SortStableFunc(out, func(a, b serviceratings.CareerBoardEntry) int {
		av, _ := value(a)
		bv, _ := value(b)
		return cmp.Or(cmp.Compare(bv, av), cmp.Compare(a.RealmID.String(), b.RealmID.String()), cmp.Compare(a.SubjectID, b.SubjectID))
	})
	return out
}
