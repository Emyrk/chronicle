package chronicle

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func unknownUnitZoneSummaries(reports []chroniclesdk.InstanceReport) []chroniclebot.UnknownUnitZoneSummary {
	type summary struct {
		entries map[uint32]struct{}
		guids   int
	}
	zones := make(map[string]*summary)
	for _, report := range reports {
		zone := report.Zone
		if zone == "" {
			zone = report.Name
		}
		for entry, unit := range report.UnknownUnits {
			if unit.Count <= 0 {
				continue
			}
			if zones[zone] == nil {
				zones[zone] = &summary{entries: make(map[uint32]struct{})}
			}
			zones[zone].entries[entry] = struct{}{}
			zones[zone].guids += unit.Count
		}
	}
	result := make([]chroniclebot.UnknownUnitZoneSummary, 0, len(zones))
	for zone, summary := range zones {
		result = append(result, chroniclebot.UnknownUnitZoneSummary{Zone: zone, Entries: len(summary.entries), GUIDs: summary.guids})
	}
	return result
}

// Best effort, once all relevant persistence and report recording succeeded.
func (w *WorkerLogParse) notifyUnknownUnits(ctx context.Context, tenantID, logID uuid.UUID, jobID int64, reports []chroniclesdk.InstanceReport) {
	zones := unknownUnitZoneSummaries(reports)
	if len(zones) == 0 || w.bot == nil || w.bot.Disabled() || w.bot.AdminNotificationsChannelID() == "" {
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
	if err := chroniclebot.EnqueueUnknownUnitNotification(ctx, w.parent.queue, w.bot, jobID, w.bot.UnknownUnitReportURL(logID, tenantSlug), zones); err != nil {
		slog.WarnContext(ctx, "failed to enqueue unknown unit category notification", slog.Any("error", err))
	}
}
