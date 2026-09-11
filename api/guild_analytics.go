package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/api/visitorid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// 60 days so the frontend can compute "vs prior period" deltas for its
// widest (30D) range selector, in addition to the raw daily series.
const guildAnalyticsLookbackDays int32 = 60

func (api *API) trackGuildPageView(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		guild := httpmw.Guild(r.Context())
		api.recordGuildResourceView(w, r, guild.ID, chroniclesdk.GuildResourceKindPage, guild.ID.String())
		next.ServeHTTP(w, r)
	})
}

func (api *API) trackGuildInstanceView(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if guildID, resourceKey, ok := trackableInstanceResource(httpmw.Instance(r.Context())); ok {
			api.recordGuildResourceView(w, r, guildID, chroniclesdk.GuildResourceKindInstance, resourceKey)
		}
		next.ServeHTTP(w, r)
	})
}

// recordGuildResourceView records low-stakes analytics without changing the
// content response when analytics storage is unavailable.
func (api *API) recordGuildResourceView(w http.ResponseWriter, r *http.Request, guildID uuid.UUID, resourceKind, resourceKey string) {
	visitorID := visitorid.Ensure(w, r)
	if err := api.Zed.RecordGuildResourceView(r.Context(), database.RecordGuildResourceViewParams{
		GuildID:      guildID,
		ResourceKind: resourceKind,
		ResourceKey:  resourceKey,
		VisitorID:    visitorID,
	}); err != nil {
		api.Opts.Logger.WarnContext(r.Context(), "failed to record guild resource view",
			"guild_id", guildID,
			"resource_kind", resourceKind,
			"resource_key", resourceKey,
			"error", err,
		)
	}
}

func trackableInstanceResource(instance database.LogInstancesGuild) (uuid.UUID, string, bool) {
	if !instance.GuildID.Valid || !instance.HashedSlug.Valid || instance.HashedSlug.String == "" {
		return uuid.Nil, "", false
	}
	return instance.GuildID.UUID, instance.HashedSlug.String, true
}

func (api *API) GuildResourceAnalytics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	rows, err := api.Zed.GuildResourceAnalytics(ctx, database.GuildResourceAnalyticsParams{
		GuildID:      guild.ID,
		LookbackDays: guildAnalyticsLookbackDays,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	days := make([]chroniclesdk.GuildResourceAnalyticsDay, 0, len(rows))
	for _, row := range rows {
		days = append(days, chroniclesdk.GuildResourceAnalyticsDay{
			ResourceKind:   row.ResourceKind,
			ResourceKey:    row.ResourceKey,
			ResourceName:   row.ResourceName,
			ViewedOn:       row.ViewedOn.Time.Format("2006-01-02"),
			Views:          row.Views,
			UniqueVisitors: row.UniqueVisitors,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildResourceAnalyticsResponse{
		LookbackDays: guildAnalyticsLookbackDays,
		Days:         days,
	})
}
