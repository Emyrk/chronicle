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
		instance := httpmw.Instance(r.Context())
		if guildID, memberKey, ok := trackableInstanceResource(instance); ok {
			groupKey := memberKey
			if instance.DuplicateGroupID.Valid {
				var err error
				groupKey, err = api.Zed.InstanceAnalyticsGroupKey(r.Context(), instance.ID)
				if err != nil {
					api.Opts.Logger.WarnContext(r.Context(), "failed to resolve instance analytics group",
						"instance_id", instance.ID,
						"error", err,
					)
					next.ServeHTTP(w, r)
					return
				}
			}
			api.recordGuildInstanceView(w, r, guildID, groupKey, memberKey)
		}
		next.ServeHTTP(w, r)
	})
}

func (api *API) recordGuildInstanceView(w http.ResponseWriter, r *http.Request, guildID uuid.UUID, groupKey, memberKey string) {
	visitorID := visitorid.Ensure(w, r)
	if err := api.Zed.RecordGuildInstanceView(r.Context(), database.RecordGuildInstanceViewParams{
		GuildID:   guildID,
		GroupKey:  groupKey,
		MemberKey: memberKey,
		VisitorID: visitorID,
	}); err != nil {
		api.Opts.Logger.WarnContext(r.Context(), "failed to record guild instance view",
			"guild_id", guildID,
			"group_key", groupKey,
			"member_key", memberKey,
			"error", err,
		)
	}
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
			ResourceKind:     row.ResourceKind,
			ResourceKey:      row.ResourceKey,
			ResourceGroupKey: row.ResourceGroupKey,
			ResourceName:     row.ResourceName,
			ViewedOn:         row.ViewedOn.Time.Format("2006-01-02"),
			Views:            row.Views,
			UniqueVisitors:   row.UniqueVisitors,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildResourceAnalyticsResponse{
		LookbackDays: guildAnalyticsLookbackDays,
		Days:         days,
	})
}
