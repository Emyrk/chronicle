package api

import (
	"context"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"golang.org/x/time/rate"
)

type suggestionStore interface {
	SuggestPlayers(context.Context, database.SuggestPlayersParams) ([]database.SuggestPlayersRow, error)
	SuggestGuilds(context.Context, database.SuggestGuildsParams) ([]database.SuggestGuildsRow, error)
}

// Limits are process-wide for this route, not per untrusted client IP. They bound
// database work and memory without a growing client-key map or queued requests.
func newSearchSuggestionsHandler(db suggestionStore) http.HandlerFunc {
	return searchSuggestionsHandler(db, rate.NewLimiter(20, 40), make(chan struct{}, 8))
}

func searchSuggestionsHandler(db suggestionStore, limiter *rate.Limiter, slots chan struct{}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		w.Header().Set("Cache-Control", "no-store")
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if strings.ContainsRune(q, 0) || !utf8.ValidString(q) || utf8.RuneCountInString(q) < 2 || utf8.RuneCountInString(q) > 64 {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Search term must contain 2 to 64 Unicode characters"})
			return
		}
		busy := func() {
			w.Header().Set("Retry-After", "1")
			httpapi.Write(ctx, w, http.StatusTooManyRequests, chroniclesdk.Response{Message: "Search is busy. Please retry shortly."})
		}
		if !limiter.Allow() {
			busy()
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			busy()
			return
		}
		ctx, cancel := context.WithTimeout(ctx, 750*time.Millisecond)
		defer cancel()
		// Escape before PostgreSQL lower() so matching uses the database's Unicode
		// case conversion for both names and input, never Go's differing case tables.
		prefix := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q) + "%"
		tenantID := servicetenant.TenantIDFromContext(ctx)
		players, err := db.SuggestPlayers(ctx, database.SuggestPlayersParams{Prefix: prefix, Query: q, TenantID: tenantID})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		guilds, err := db.SuggestGuilds(ctx, database.SuggestGuildsParams{Prefix: prefix, Query: q, TenantID: tenantID})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		result := chroniclesdk.SearchSuggestionsResponse{Players: make([]chroniclesdk.SearchSuggestionPlayer, 0, len(players)), Guilds: make([]chroniclesdk.SearchSuggestionGuild, 0, len(guilds))}
		for _, p := range players {
			result.Players = append(result.Players, chroniclesdk.SearchSuggestionPlayer{ID: chroniclesdk.GUIDString(p.ID), Name: p.Name, Class: string(p.Class), RealmID: p.RealmID, RealmName: p.RealmName})
		}
		for _, g := range guilds {
			result.Guilds = append(result.Guilds, chroniclesdk.SearchSuggestionGuild{ID: g.ID, Name: g.Name, RealmID: g.RealmID, RealmName: g.RealmName})
		}
		httpapi.Write(ctx, w, http.StatusOK, result)
	}
}
