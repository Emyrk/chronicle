package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// UnknownUnitCategory describes unique observed GUIDs that remain unclassified
// after enrichment and finalization, not combat-event or lookup counts.
type UnknownUnitCategory struct {
	Name    string
	Count   int
	Samples []guid.GUID
}

type UnknownUnitNotificationContext struct {
	TenantID    uuid.UUID
	Zone        string
	InstanceURL string
}

// EnqueueUnknownUnitNotifications must be called after the finalized instance
// commits. Callers should log errors without failing the successful parse.
// Each entry/zone gets one alert, independent of spawns, samples and instance;
// River suppresses repeated alerts within a 24-hour uniqueness period.
func EnqueueUnknownUnitNotifications(ctx context.Context, queue AdminNotificationInserter, bot *Bot, instance UnknownUnitNotificationContext, units map[uint32]UnknownUnitCategory) error {
	if bot == nil || bot.Disabled() || bot.AdminNotificationsChannelID() == "" {
		return nil
	}
	zone := strings.TrimSpace(instance.Zone)
	if zone == "" {
		return nil
	}
	entries := make([]uint32, 0, len(units))
	for entry, unit := range units {
		if entry <= 0xFFFFFF && unit.Count > 0 {
			entries = append(entries, entry)
		}
	}
	slices.Sort(entries)
	var errs []error
	for _, entry := range entries {
		unit := units[entry]
		name := strings.TrimSpace(unit.Name)
		if name == "" {
			name = "Unknown"
		}
		samples := make([]guid.GUID, 0, len(unit.Samples))
		for _, sample := range unit.Samples {
			sampleEntry, _ := sample.GetEntry()
			if !sample.IsZero() && sampleEntry == entry {
				samples = append(samples, sample)
			}
		}
		slices.Sort(samples)
		samples = slices.Compact(samples)
		if len(samples) > 5 {
			samples = samples[:5]
		}
		sampleText := make([]string, 0, len(samples))
		for _, sample := range samples {
			sampleText = append(sampleText, sample.String())
		}
		entryText := fmt.Sprint(entry)
		if entry == 0 {
			entryText = "No meaningful entry ID (unresolved GUID structure or zero template ID)"
		}
		fields := []AdminNotificationField{
			{Name: "Zone", Value: boundedUnknownUnitField(zone), Inline: true},
			{Name: "Entry ID", Value: entryText, Inline: true},
			{Name: "Name", Value: boundedUnknownUnitField(name)},
			{Name: "Unique observed GUIDs", Value: fmt.Sprint(unit.Count), Inline: true},
		}
		if len(sampleText) > 0 {
			fields = append(fields, AdminNotificationField{Name: "Sample GUIDs", Value: strings.Join(sampleText, "\n")})
		}
		err := EnqueueAdminNotification(ctx, queue, bot, ArgsNotifyAdmin{
			Title: "Unknown unit category", URL: instance.InstanceURL, Fields: fields,
			UniqueKey:      fmt.Sprintf("unknown-unit:%s:%s:%d", instance.TenantID, zone, entry),
			DeduplicateFor: 24 * time.Hour,
		})
		if err != nil {
			errs = append(errs, fmt.Errorf("unknown unit entry %d: %w", entry, err))
		}
	}
	return errors.Join(errs...)
}

func boundedUnknownUnitField(value string) string {
	// Bound bytes as well as characters so all Discord character-count variants
	// remain below the field limit, without splitting a UTF-8 sequence.
	if len(value) <= 1000 {
		return value
	}
	for index := range value {
		if index >= 997 {
			return value[:index] + "…"
		}
	}
	return value
}

// UnknownUnitInstanceURL uses the same tenant and durable-slug routing as raid announcements.
func (b *Bot) UnknownUnitInstanceURL(instanceID uuid.UUID, slug, tenantSlug pgtype.Text) string {
	return b.instanceURL(instanceID, slug, tenantSlug)
}
