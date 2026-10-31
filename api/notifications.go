package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var notificationEvents = map[chroniclesdk.NotificationEvent]struct{}{
	chroniclesdk.NotificationEventSidekickUploadAccepted: {},
	chroniclesdk.NotificationEventSidekickAppendAccepted: {},
	chroniclesdk.NotificationEventUploadProcessed:        {},
}

func (a *API) discordLinked(ctx context.Context, userID uuid.UUID) (bool, error) {
	_, err := a.Opts.Zed.GetUserAuthLinkByUserIDAndProvider(ctx, database.GetUserAuthLinkByUserIDAndProviderParams{
		UserID: userID, Provider: "discord",
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (a *API) GetMyNotificationSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	response, err := a.notificationSettings(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (a *API) UpdateMyNotificationSetting(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	var req chroniclesdk.NotificationSetting
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if _, ok := notificationEvents[req.Event]; !ok || req.Channel != chroniclesdk.NotificationChannelDiscord {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Unknown notification setting."})
		return
	}
	if req.Enabled {
		linked, err := a.discordLinked(ctx, claims.Subject)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if !linked {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Connect Discord to enable Discord notifications."})
			return
		}
	}
	if _, err := a.Opts.Zed.UpsertUserNotificationSetting(ctx, database.UpsertUserNotificationSettingParams{
		UserID: claims.Subject, Channel: string(req.Channel), Event: string(req.Event), Enabled: req.Enabled,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response, err := a.notificationSettings(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (a *API) notificationSettings(ctx context.Context, userID uuid.UUID) (chroniclesdk.NotificationSettings, error) {
	linked, err := a.discordLinked(ctx, userID)
	if err != nil {
		return chroniclesdk.NotificationSettings{}, err
	}
	rows, err := a.Opts.Zed.ListUserNotificationSettings(ctx, userID)
	if err != nil {
		return chroniclesdk.NotificationSettings{}, err
	}
	settings := make([]chroniclesdk.NotificationSetting, 0, len(rows))
	for _, row := range rows {
		settings = append(settings, chroniclesdk.NotificationSetting{
			Channel: chroniclesdk.NotificationChannel(row.Channel),
			Event:   chroniclesdk.NotificationEvent(row.Event),
			Enabled: row.Enabled,
		})
	}
	return chroniclesdk.NotificationSettings{DiscordLinked: linked, Settings: settings}, nil
}

// notifySidekickAppendAccepted is best effort; a failed notification never
// fails the append.
func (a *API) notifySidekickAppendAccepted(ctx context.Context, logGroupID, uploadID uuid.UUID) {
	claims := chronauth.MustAuthenticatedClaims(ctx)
	var tenantSlug pgtype.Text
	if tenant := servicetenant.TenantFromContext(ctx); tenant != nil {
		tenantSlug = tenant.Slug
	}
	if err := a.Opts.Bot.NotifySidekickAppendAccepted(ctx, claims.Subject, logGroupID, uploadID, tenantSlug); err != nil {
		a.Opts.Logger.WarnContext(ctx, "failed to notify sidekick append accepted",
			slog.String("log_group_id", logGroupID.String()), slog.Any("error", err))
	}
}

// notifySidekickUploadAccepted is best effort; a failed notification never
// fails the upload.
func (a *API) notifySidekickUploadAccepted(ctx context.Context, logGroupID uuid.UUID) {
	claims := chronauth.MustAuthenticatedClaims(ctx)
	var tenantSlug pgtype.Text
	if tenant := servicetenant.TenantFromContext(ctx); tenant != nil {
		tenantSlug = tenant.Slug
	}
	if err := a.Opts.Bot.NotifySidekickUploadAccepted(ctx, claims.Subject, logGroupID, tenantSlug); err != nil {
		a.Opts.Logger.WarnContext(ctx, "failed to notify sidekick upload accepted",
			slog.String("log_group_id", logGroupID.String()), slog.Any("error", err))
	}
}
