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

// LeaderboardCareer ranks characters by career Mastery, Peak, and Renown in one
// response. It computes on every request; the response is cached at the edge.
func (api *API) LeaderboardCareer(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	tenant := servicetenant.TenantFromContext(ctx)
	if tenant == nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Open a tenant site to view career ratings."})
		return
	}
	q := r.URL.Query()
	limit := careerBoardDefaultLimit
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > careerBoardMaxLimit {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "limit must be between 1 and 250"})
			return
		}
		limit = n
	}
	db := database.New(api.Opts.Pool)
	realm := uuid.Nil
	if raw := q.Get("realm"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil || id == uuid.Nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid realm ID"})
			return
		}
		if err := careerRealmOwnership(ctx, db, tenant.ID, id); err != nil {
			writeCareerError(w, r, err)
			return
		}
		realm = id
	}

	board, err := serviceratings.ReadCareerBoard(ctx, db, tenant.ID, realm)
	if err != nil {
		writeCareerError(w, r, err)
		return
	}
	ranked := map[string][]serviceratings.CareerBoardEntry{}
	for _, sort := range []string{"mastery", "peak", "renown"} {
		ranked[sort] = rankCareerBoard(board.Entries, sort)
	}

	// One name lookup for every character shown on any board.
	type nameKey struct {
		realm uuid.UUID
		guid  string
	}
	seen := map[nameKey]bool{}
	var realms []uuid.UUID
	var guids []string
	for _, entries := range ranked {
		for _, e := range entries[:min(limit, len(entries))] {
			k := nameKey{e.RealmID, e.PlayerGUID}
			if !seen[k] {
				seen[k] = true
				realms, guids = append(realms, e.RealmID), append(guids, e.PlayerGUID)
			}
		}
	}
	byKey := map[nameKey]database.ListLeaderboardCareerPlayerNamesRow{}
	if len(realms) > 0 {
		names, err := db.ListLeaderboardCareerPlayerNames(ctx, database.ListLeaderboardCareerPlayerNamesParams{RealmIds: realms, SubjectIds: guids})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		for _, n := range names {
			byKey[nameKey{n.RealmID, n.SubjectID}] = n
		}
	}
	page := func(sort string) chroniclesdk.CareerLeaderboardBoard {
		entries := ranked[sort]
		out := chroniclesdk.CareerLeaderboardBoard{Total: len(entries), Entries: []chroniclesdk.CareerLeaderboardEntry{}}
		for _, e := range entries[:min(limit, len(entries))] {
			n := byKey[nameKey{e.RealmID, e.PlayerGUID}]
			out.Entries = append(out.Entries, chroniclesdk.CareerLeaderboardEntry{
				RealmID: e.RealmID.String(), RealmName: n.RealmName,
				PlayerGUID: e.PlayerGUID, PlayerName: cmp.Or(n.PlayerName, e.PlayerGUID),
				PlayerClass: cmp.Or(e.PlayerClass, n.PlayerClass), GuildName: n.GuildName,
				PlayerSpec: e.PlayerSpec, PlayerSubSpec: e.PlayerSubSpec, ChosenMetric: e.ChosenMetric,
				Mastery: e.Mastery, Peak: e.Peak, Renown: e.Renown,
			})
		}
		return out
	}
	writeCacheableLeaderboardResponse(ctx, w, http.StatusOK, chroniclesdk.CareerLeaderboardResponse{
		Status: board.Status, Mastery: page("mastery"), Peak: page("peak"), Renown: page("renown"),
	})
}

// rankCareerBoard keeps characters that have the sorted value and orders them
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
		return cmp.Or(cmp.Compare(bv, av), cmp.Compare(a.RealmID.String(), b.RealmID.String()), cmp.Compare(a.PlayerGUID, b.PlayerGUID))
	})
	return out
}
