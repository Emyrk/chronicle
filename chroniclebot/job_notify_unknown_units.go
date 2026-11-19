package chroniclebot

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindNotifyUnknownUnits = "notify-unknown-units"
const unknownUnitGlobalCooldown = 12 * time.Hour
const unknownUnitCooldownMetadataKey = "unknown_unit_cooldown_until"

// ArgsNotifyUnknownUnits holds one deployment-wide slot across all tenants,
// zones, channels, and replicas. Suppressed reports are not queued for later.
type ArgsNotifyUnknownUnits struct {
	Notification ArgsNotifyAdmin `json:"notification"`
}

func (ArgsNotifyUnknownUnits) Kind() string { return KindNotifyUnknownUnits }
func (ArgsNotifyUnknownUnits) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueDiscordAnnouncements,
		MaxAttempts: 2,
		// No ByArgs or ByPeriod: River's database uniqueness covers this entire
		// job kind, including its scheduled cooldown, without time-bucket edges.
		UniqueOpts: river.UniqueOpts{ByState: []rivertype.JobState{
			rivertype.JobStateAvailable, rivertype.JobStatePending,
			rivertype.JobStateRunning, rivertype.JobStateRetryable, rivertype.JobStateScheduled,
		}},
	}
}

type WorkerNotifyUnknownUnits struct {
	river.WorkerDefaults[ArgsNotifyUnknownUnits]
	notifier *WorkerNotifyAdmin
	now      func() time.Time // Optional deterministic clock, set before use.
}

func (b *Bot) NewWorkerNotifyUnknownUnits() river.Worker[ArgsNotifyUnknownUnits] {
	return &WorkerNotifyUnknownUnits{notifier: &WorkerNotifyAdmin{bot: b, queue: b.queue}}
}

func (w *WorkerNotifyUnknownUnits) Work(ctx context.Context, job *river.Job[ArgsNotifyUnknownUnits]) error {
	now := time.Now
	if w.now != nil {
		now = w.now
	}
	var metadata struct {
		Until time.Time `json:"unknown_unit_cooldown_until"`
	}
	if len(job.Metadata) > 0 {
		if err := json.Unmarshal(job.Metadata, &metadata); err != nil {
			return fmt.Errorf("decode unknown unit cooldown: %w", err)
		}
	}
	if !metadata.Until.IsZero() {
		if remaining := metadata.Until.Sub(now()); remaining > 0 {
			return river.JobSnooze(remaining)
		}
		// Finishing releases the shared unique slot. Do not resend the old report.
		return nil
	}
	// Verify the River work context before sending anything. The timestamp is
	// persisted with the snooze, so restarts do not reset the cooldown.
	if err := river.MetadataSet(ctx, unknownUnitCooldownMetadataKey, nil); err != nil {
		return err
	}
	if err := w.notifier.Work(ctx, &river.Job[ArgsNotifyAdmin]{Args: job.Args.Notification}); err != nil {
		return err
	}
	if err := river.MetadataSet(ctx, unknownUnitCooldownMetadataKey, now().Add(unknownUnitGlobalCooldown)); err != nil {
		return err
	}
	return river.JobSnooze(unknownUnitGlobalCooldown)
}
