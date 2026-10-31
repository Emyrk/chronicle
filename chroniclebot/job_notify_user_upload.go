package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// discordMaxEmbeds is Discord's limit on embeds per message.
const discordMaxEmbeds = 10

// userDiscordNotificationTarget returns the Discord ID to DM when the user has
// opted into the event, or "" when they have not.
func (b *Bot) userDiscordNotificationTarget(ctx context.Context, userID uuid.UUID, event chroniclesdk.NotificationEvent) (string, error) {
	discordID, err := b.config.DB.GetDiscordNotificationTarget(ctx, database.GetDiscordNotificationTargetParams{
		UserID: userID, Event: string(event),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return discordID, err
}

// NotifySidekickQuotaFailure DMs the user when Sidekick cannot upload because
// their Chronicle storage is full, if they opted in. Repeated failures are
// limited to one notification per user per hour.
func (b *Bot) NotifySidekickQuotaFailure(ctx context.Context, userID uuid.UUID, tenantSlug pgtype.Text) error {
	if !b.Available() {
		return nil
	}
	discordID, err := b.userDiscordNotificationTarget(ctx, userID, chroniclesdk.NotificationEventSidekickNotifications)
	if err != nil || discordID == "" {
		return err
	}
	return b.EnqueueDiscordDM(ctx, ArgsSendDiscordDM{
		DiscordID: discordID,
		Message: DiscordDirectMessage{Embeds: []*discordgo.MessageEmbed{{
			Author:      &discordgo.MessageEmbedAuthor{Name: "SIDEKICK"},
			Title:       "Upload blocked: storage full",
			Description: "Sidekick could not upload your combat log because your Chronicle storage is full. Delete stored log files or increase your storage allowance, then try again.",
			URL:         fmt.Sprintf("%s/account/storage", b.tenantBaseURL(tenantSlug)),
			Color:       0xED4245,
		}}},
		UniqueKey:      "sidekick-quota-failure",
		DeduplicateFor: time.Hour,
	})
}

// NotifySidekickUploadAccepted DMs the uploader that a Sidekick upload was
// accepted, if they opted in.
func (b *Bot) NotifySidekickUploadAccepted(ctx context.Context, userID, logGroupID uuid.UUID, tenantSlug pgtype.Text) error {
	return b.notifySidekickUploadAccepted(
		ctx,
		userID,
		logGroupID,
		tenantSlug,
		chroniclesdk.NotificationEventSidekickNotifications,
		"Upload accepted",
		"Your combat log was received and is being processed.",
		"sidekick-upload-accepted:"+logGroupID.String(),
	)
}

// NotifySidekickAppendAccepted DMs the uploader that a Sidekick append was
// accepted, if they opted into Sidekick append notifications.
func (b *Bot) NotifySidekickAppendAccepted(ctx context.Context, userID, logGroupID, uploadID uuid.UUID, tenantSlug pgtype.Text) error {
	return b.notifySidekickUploadAccepted(
		ctx,
		userID,
		logGroupID,
		tenantSlug,
		chroniclesdk.NotificationEventSidekickNotifications,
		"Log update accepted",
		"Your new combat log data was received. The previous log will automatically be updated.",
		"sidekick-append-accepted:"+uploadID.String(),
	)
}

func (b *Bot) notifySidekickUploadAccepted(
	ctx context.Context,
	userID, logGroupID uuid.UUID,
	tenantSlug pgtype.Text,
	event chroniclesdk.NotificationEvent,
	title, description, uniqueKey string,
) error {
	if !b.Available() {
		return nil
	}
	discordID, err := b.userDiscordNotificationTarget(ctx, userID, event)
	if err != nil || discordID == "" {
		return err
	}
	return b.EnqueueDiscordDM(ctx, ArgsSendDiscordDM{
		DiscordID: discordID,
		Message: DiscordDirectMessage{Embeds: []*discordgo.MessageEmbed{{
			Author:      &discordgo.MessageEmbedAuthor{Name: "SIDEKICK"},
			Title:       title,
			Description: description,
			URL:         fmt.Sprintf("%s/logs/%s", b.tenantBaseURL(tenantSlug), logGroupID),
			Color:       0x5865F2,
		}}},
		UniqueKey: uniqueKey,
	})
}

const KindNotifyUploadProcessed = "notify-upload-processed"

// ArgsNotifyUploadProcessed DMs a log's uploader the instance announcements
// for a newly parsed log, if they opted in.
type ArgsNotifyUploadProcessed struct {
	LogGroupID uuid.UUID `json:"log_group_id"`
}

func (ArgsNotifyUploadProcessed) Kind() string { return KindNotifyUploadProcessed }

func (ArgsNotifyUploadProcessed) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueDiscordAnnouncements,
		Priority:    riverconst.PriorityDefault,
		MaxAttempts: 1,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
				rivertype.JobStateRetryable,
			},
		},
	}
}

type WorkerNotifyUploadProcessed struct {
	river.WorkerDefaults[ArgsNotifyUploadProcessed]
	bot *Bot
}

func (b *Bot) NewWorkerNotifyUploadProcessed() river.Worker[ArgsNotifyUploadProcessed] {
	return &WorkerNotifyUploadProcessed{bot: b}
}

func (w *WorkerNotifyUploadProcessed) Work(ctx context.Context, job *river.Job[ArgsNotifyUploadProcessed]) error {
	if !w.bot.Available() {
		return nil
	}
	db := w.bot.config.DB
	group, err := db.GetWoWLogGroupByID(ctx, job.Args.LogGroupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load log group: %w", err)
	}
	discordID, err := w.bot.userDiscordNotificationTarget(ctx, group.WoWLogGroup.Owner, chroniclesdk.NotificationEventUploadProcessed)
	if err != nil || discordID == "" {
		return err
	}

	instances, err := db.GetInstancesByLogGroupID(ctx, job.Args.LogGroupID)
	if err != nil {
		return fmt.Errorf("list instances: %w", err)
	}
	embeds := make([]*discordgo.MessageEmbed, 0, len(instances))
	seenRuns := make(map[uuid.UUID]struct{}, len(instances))
	for _, inst := range instances {
		instance, err := db.GetLogInstanceForDiscordAnnouncement(ctx, inst.ID)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return fmt.Errorf("load instance: %w", err)
		}
		if !instance.Category.Valid {
			continue
		}
		runID := effectiveRunID(instance)
		if _, ok := seenRuns[runID]; ok {
			continue
		}
		seenRuns[runID] = struct{}{}
		message, err := w.bot.buildAnnouncement(ctx, runID)
		if err != nil {
			return err
		}
		embeds = append(embeds, message.Embeds...)
		if len(embeds) >= discordMaxEmbeds {
			embeds = embeds[:discordMaxEmbeds]
			break
		}
	}
	if len(embeds) == 0 {
		return nil
	}
	return w.bot.EnqueueDiscordDM(ctx, ArgsSendDiscordDM{
		DiscordID: discordID,
		Message:   DiscordDirectMessage{Embeds: embeds},
		UniqueKey: "upload-processed:" + job.Args.LogGroupID.String(),
	})
}
