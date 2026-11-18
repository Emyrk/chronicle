package chronicle

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// notifyUnknownUnits is best effort and runs only after instance persistence.
// Notification lookup/queue failures must never undo a successfully parsed log.
func (w *WorkerLogParse) notifyUnknownUnits(ctx context.Context, tenantID uuid.UUID, instance database.LogInstance, unknown map[uint32]instances.UnknownUnit) {
	if len(unknown) == 0 || w.bot == nil || w.bot.Disabled() || w.bot.AdminNotificationsChannelID() == "" {
		return
	}
	if w.parent.queue == nil {
		slog.WarnContext(ctx, "unknown unit notification queue unavailable")
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var tenantSlug pgtype.Text
	if tenantID != uuid.Nil {
		tenant, err := w.parent.Zed.GetTenantByID(ctx, tenantID)
		if err != nil {
			slog.WarnContext(ctx, "unknown unit notification tenant lookup failed", slog.Any("error", err))
			return
		}
		tenantSlug = tenant.Slug
	}
	units := make(map[uint32]chroniclebot.UnknownUnitCategory, len(unknown))
	for entry, unit := range unknown {
		units[entry] = chroniclebot.UnknownUnitCategory{Name: unit.Name, Count: unit.Count, Samples: unit.Samples}
	}
	if err := chroniclebot.EnqueueUnknownUnitNotifications(ctx, w.parent.queue, w.bot, chroniclebot.UnknownUnitNotificationContext{
		TenantID: tenantID, Zone: instance.Name, InstanceURL: w.bot.UnknownUnitInstanceURL(instance.ID, instance.HashedSlug, tenantSlug),
	}, units); err != nil {
		slog.WarnContext(ctx, "failed to enqueue unknown unit category notifications", slog.Any("error", err))
	}
}
