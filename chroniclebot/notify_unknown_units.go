package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// UnknownUnitZoneSummary counts distinct entry IDs within a zone. GUID counts
// are summed per instance; a GUID observed in two instances counts twice.
type UnknownUnitZoneSummary struct {
	Zone    string
	Entries int
	GUIDs   int
}

// EnqueueUnknownUnitNotification sends one bounded summary per parse job after
// successful persistence, subject to local zone and deployment-wide cooldowns.
func EnqueueUnknownUnitNotification(ctx context.Context, queue AdminNotificationInserter, bot *Bot, tenantID uuid.UUID, jobID int64, reportURL string, zones []UnknownUnitZoneSummary) error {
	if bot == nil || bot.Disabled() || bot.AdminNotificationsChannelID() == "" {
		return nil
	}
	// Suppress Han-named zones only at the alert boundary, preserving parse
	// reports. Filter before reserving either the local or global cooldown.
	zones = slices.DeleteFunc(slices.Clone(zones), func(z UnknownUnitZoneSummary) bool {
		return z.GUIDs <= 0 || strings.ContainsFunc(z.Zone, func(r rune) bool { return unicode.Is(unicode.Han, r) })
	})
	if len(zones) == 0 {
		return nil
	}
	zones, finish := bot.unknownUnitDebounce.reserve(tenantID, zones)
	if len(zones) == 0 {
		return nil
	}
	succeeded := false
	defer func() { finish(succeeded) }()
	slices.SortFunc(zones, func(a, b UnknownUnitZoneSummary) int {
		if a.Zone < b.Zone {
			return -1
		}
		if a.Zone > b.Zone {
			return 1
		}
		return 0
	})
	totalGUIDs := 0
	for _, zone := range zones {
		totalGUIDs += zone.GUIDs
	}
	fields := []AdminNotificationField{{Name: "Summary", Value: fmt.Sprintf("%d zones; %d unknown GUIDs (unique within each instance, summed across instances). Entry counts are distinct per zone. Entry 0 groups GUIDs without a meaningful template ID. Details and sample GUIDs are in the log's parse report.", len(zones), totalGUIDs)}}
	// Bound both the number of fields and total embed size, even with long UTF-8
	// zone names. Twenty 200-byte fields leave ample room below Discord's 6000.
	const maxZones = 20
	for _, zone := range zones[:min(len(zones), maxZones)] {
		name := zone.Zone
		if name == "" {
			name = "Unknown zone"
		}
		fields = append(fields, AdminNotificationField{Name: boundedUnknownUnitText(name, 160), Value: fmt.Sprintf("%d distinct entries; %d GUIDs (per-instance sum)", zone.Entries, zone.GUIDs)})
	}
	if len(zones) > maxZones {
		fields = append(fields, AdminNotificationField{Name: "More zones", Value: fmt.Sprintf("%d more zones. See the parse report for all details.", len(zones)-maxZones)})
	}
	if queue == nil {
		return errors.New("unknown unit notification queue unavailable")
	}
	result, err := queue.Insert(ctx, ArgsNotifyUnknownUnits{Notification: ArgsNotifyAdmin{
		ChannelID: bot.AdminNotificationsChannelID(),
		Title:     "Unknown unit categories in parse job", URL: reportURL, Fields: fields,
		// No rolling time bucket: retries of this parse job retain the same key.
		UniqueKey:   fmt.Sprintf("unknown-unit-parse-job:%d", jobID),
		MaxAttempts: 2,
		ExpireAfter: 24 * time.Hour,
	}}, nil)
	// A globally suppressed zone was never announced and must not consume its
	// local 72-hour window. Another report may try it after the global cooldown.
	succeeded = err == nil && (result == nil || !result.UniqueSkippedAsDuplicate)
	return err
}

func boundedUnknownUnitText(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	end := 0
	for index := range value {
		if index > limit-3 {
			break
		}
		end = index
	}
	return value[:end] + "…"
}

// UnknownUnitReportURL links to the authenticated log detail and parse report.
func (b *Bot) UnknownUnitReportURL(logID uuid.UUID, tenantSlug pgtype.Text) string {
	return fmt.Sprintf("%s/logs/%s", b.tenantBaseURL(tenantSlug), logID)
}
