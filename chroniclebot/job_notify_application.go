package chroniclebot

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/bwmarrin/discordgo"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindNotifyApplication = "notify-application"

// ArgsNotifyApplication are the arguments for the notify-application River job.
type ArgsNotifyApplication struct {
	ApplicationID string `json:"application_id"`
	Name          string `json:"name"`
	Applicant     string `json:"applicant"`
	Tagline       string `json:"tagline"`
	ReviewURL     string `json:"review_url"`
	ChannelID     string `json:"channel_id"`
}

func (a ArgsNotifyApplication) Kind() string { return KindNotifyApplication }

func (a ArgsNotifyApplication) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueDiscordSync,
		Priority:    riverconst.PriorityDefault,
		MaxAttempts: 3,
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

// WorkerNotifyApplication processes application notification jobs.
type WorkerNotifyApplication struct {
	river.WorkerDefaults[ArgsNotifyApplication]
	bot *Bot
}

// NewWorkerNotifyApplication creates a new worker for application notifications.
func (b *Bot) NewWorkerNotifyApplication() river.Worker[ArgsNotifyApplication] {
	return &WorkerNotifyApplication{bot: b}
}

func (w *WorkerNotifyApplication) Work(ctx context.Context, job *river.Job[ArgsNotifyApplication]) error {
	b := w.bot
	channelID := job.Args.ChannelID
	if channelID == "" {
		b.logger.Debug("applications channel not configured, skipping notification",
			slog.String("application_id", job.Args.ApplicationID),
		)
		return nil
	}

	if b.session == nil {
		b.logger.Warn("bot session is nil, skipping application notification")
		return nil
	}

	tagline := job.Args.Tagline
	if tagline == "" {
		tagline = "No tagline provided"
	}

	embed := &discordgo.MessageEmbed{
		Title:       "🆕 New Server Application",
		Description: fmt.Sprintf("**%s** wants to add their server to Chronicle", job.Args.Name),
		URL:         job.Args.ReviewURL,
		Fields: []*discordgo.MessageEmbedField{
			{Name: "Applicant", Value: job.Args.Applicant, Inline: true},
			{Name: "Tagline", Value: tagline, Inline: true},
		},
		Color: 0x5865F2, // Discord blurple
	}
	_, err := b.session.ChannelMessageSendEmbed(channelID, embed, discordRequestOption(ctx, "application_notification"))
	if err != nil {
		return fmt.Errorf("send application notification to channel %s: %w", channelID, err)
	}

	b.logger.Info("sent application notification",
		slog.String("application_id", job.Args.ApplicationID),
		slog.String("channel_id", channelID),
	)
	return nil
}
