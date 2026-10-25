package chroniclebot

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/bwmarrin/discordgo"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindNotifyAdmin = "notify-admin"

// AdminNotificationField is one short piece of context in an admin alert.
type AdminNotificationField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

// ArgsNotifyAdmin delivers an embed to the configured admin channel. Callers
// provide the title, review link and fields; do not include private evidence.
type ArgsNotifyAdmin struct {
	Title     string                   `json:"title"`
	URL       string                   `json:"url"`
	Fields    []AdminNotificationField `json:"fields"`
	ChannelID string                   `json:"channel_id"`
}

func (ArgsNotifyAdmin) Kind() string { return KindNotifyAdmin }
func (ArgsNotifyAdmin) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueDiscordAnnouncements, MaxAttempts: 3}
}

// AdminNotificationInserter is the small River surface needed to enqueue alerts.
type AdminNotificationInserter interface {
	Insert(context.Context, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

// EnqueueAdminNotification routes an admin alert to the configured channel.
// A disabled bot or empty channel is a no-op. Callers decide how to handle
// insertion errors; optional alerts should log them without failing requests.
func EnqueueAdminNotification(ctx context.Context, queue AdminNotificationInserter, bot *Bot, args ArgsNotifyAdmin) error {
	if bot == nil || bot.Disabled() || bot.AdminNotificationsChannelID() == "" {
		return nil
	}
	if queue == nil {
		return errors.New("admin notification queue unavailable")
	}
	args.ChannelID = bot.AdminNotificationsChannelID()
	_, err := queue.Insert(ctx, args, nil)
	return err
}

type WorkerNotifyAdmin struct {
	river.WorkerDefaults[ArgsNotifyAdmin]
	bot *Bot
}

func (b *Bot) NewWorkerNotifyAdmin() river.Worker[ArgsNotifyAdmin] {
	return &WorkerNotifyAdmin{bot: b}
}

func adminNotificationMessage(args ArgsNotifyAdmin) *discordgo.MessageSend {
	fields := make([]*discordgo.MessageEmbedField, len(args.Fields))
	for i, field := range args.Fields {
		fields[i] = &discordgo.MessageEmbedField{Name: field.Name, Value: field.Value, Inline: field.Inline}
	}
	return &discordgo.MessageSend{
		Embeds: []*discordgo.MessageEmbed{{
			Title:  args.Title,
			URL:    args.URL,
			Fields: fields,
			Color:  0x5865F2,
		}},
		AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}},
	}
}

func (w *WorkerNotifyAdmin) Work(_ context.Context, job *river.Job[ArgsNotifyAdmin]) error {
	if w.bot.session == nil {
		return errors.New("discord bot session unavailable")
	}
	args := job.Args
	_, err := w.bot.session.ChannelMessageSendComplex(args.ChannelID, adminNotificationMessage(args))
	if err != nil {
		return fmt.Errorf("send admin notification to channel %s: %w", args.ChannelID, err)
	}
	return nil
}
