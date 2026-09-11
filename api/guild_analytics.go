package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/api/visitorid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const guildAnalyticsLookbackDays int32 = 30

// RecordGuildResourceView records a low-stakes, cookie-based analytics view.
// Resource ownership is resolved on the server so callers cannot attribute a
// view to an arbitrary guild. Unsupported and untrackable resources are no-ops.
func (api *API) RecordGuildResourceView(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.RecordGuildResourceViewRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	guildID, resourceKey, ok, err := api.resolveGuildAnalyticsResource(ctx, req)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNoContent, nil)
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}
	if !ok {
		httpapi.Write(ctx, w, http.StatusNoContent, nil)
		return
	}

	visitorID := visitorid.Ensure(w, r)
	if err := api.Zed.RecordGuildResourceView(ctx, database.RecordGuildResourceViewParams{
		GuildID:      guildID,
		ResourceKind: req.ResourceKind,
		ResourceKey:  resourceKey,
		VisitorID:    visitorID,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) resolveGuildAnalyticsResource(ctx context.Context, req chroniclesdk.RecordGuildResourceViewRequest) (uuid.UUID, string, bool, error) {
	switch req.ResourceKind {
	case chroniclesdk.GuildResourceKindPage:
		guildID, err := uuid.Parse(req.ResourceID)
		if err != nil {
			return uuid.Nil, "", false, nil
		}
		guild, err := api.Zed.GetGuildByID(ctx, guildID)
		if err != nil {
			return uuid.Nil, "", false, err
		}
		return guild.ID, guild.ID.String(), true, nil

	case chroniclesdk.GuildResourceKindInstance:
		resourceID := strings.TrimSpace(req.ResourceID)
		var (
			instance database.LogInstancesGuild
			err      error
		)
		if instanceID, parseErr := uuid.Parse(resourceID); parseErr == nil {
			instance, err = api.Zed.Instance(ctx, instanceID)
		} else {
			instance, err = api.Zed.InstanceBySlug(ctx, pgtype.Text{String: resourceID, Valid: resourceID != ""})
		}
		if err != nil {
			return uuid.Nil, "", false, err
		}
		guildID, resourceKey, ok := trackableInstanceResource(instance)
		return guildID, resourceKey, ok, nil

	default:
		return uuid.Nil, "", false, nil
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
