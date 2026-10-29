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

const KindSendDiscordDM = "send-discord-dm"

// DiscordDirectMessage is the serializable subset of a Discord message that
// Chronicle supports for queued direct messages. Mentions are always disabled
// by the worker.
type DiscordDirectMessage struct {
	Content string                    `json:"content,omitempty"`
	Embeds  []*discordgo.MessageEmbed `json:"embeds,omitempty"`
}

// ArgsSendDiscordDM delivers a direct message to a Discord user.
type ArgsSendDiscordDM struct {
	DiscordID string               `json:"discord_id"`
	Message   DiscordDirectMessage `json:"message"`
	// UniqueKey distinguishes otherwise identical messages while preserving
	// River's active-job deduplication. Event or record IDs are good keys.
	UniqueKey string `json:"unique_key,omitempty"`
}

func (ArgsSendDiscordDM) Kind() string { return KindSendDiscordDM }
func (a ArgsSendDiscordDM) InsertOpts() river.InsertOpts {
	opts := river.InsertOpts{
		Queue:       riverconst.QueueDiscordAnnouncements,
		MaxAttempts: 1,
	}
	if a.UniqueKey != "" {
		opts.UniqueOpts = river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
				rivertype.JobStateRetryable,
			},
		}
	}
	return opts
}

// DiscordDMInserter is the small River surface needed to enqueue direct messages.
type DiscordDMInserter interface {
	Insert(context.Context, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

// EnqueueDiscordDM queues a direct message to a Discord user. A disabled bot or
// empty Discord user ID is a no-op. Callers decide whether insertion failures
// are fatal or best effort.
func EnqueueDiscordDM(ctx context.Context, queue DiscordDMInserter, bot *Bot, args ArgsSendDiscordDM) error {
	if bot == nil || bot.Disabled() || args.DiscordID == "" {
		return nil
	}
	if queue == nil {
		return errors.New("discord DM queue unavailable")
	}
	_, err := queue.Insert(ctx, args, nil)
	return err
}

// EnqueueDiscordDM uses the bot's configured River queue. This is the normal
// entry point for code that receives the shared Bot service.
func (b *Bot) EnqueueDiscordDM(ctx context.Context, args ArgsSendDiscordDM) error {
	if b == nil {
		return nil
	}
	return EnqueueDiscordDM(ctx, b.queue, b, args)
}

type WorkerSendDiscordDM struct {
	river.WorkerDefaults[ArgsSendDiscordDM]
	bot *Bot
}

func (b *Bot) NewWorkerSendDiscordDM() river.Worker[ArgsSendDiscordDM] {
	return &WorkerSendDiscordDM{bot: b}
}

func discordDirectMessage(message DiscordDirectMessage) *discordgo.MessageSend {
	return &discordgo.MessageSend{
		Content:         message.Content,
		Embeds:          message.Embeds,
		AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}},
	}
}

func (w *WorkerSendDiscordDM) Work(_ context.Context, job *river.Job[ArgsSendDiscordDM]) error {
	if w.bot.session == nil {
		return errors.New("discord bot session unavailable")
	}
	channel, err := w.bot.session.UserChannelCreate(job.Args.DiscordID)
	if err != nil {
		return fmt.Errorf("create Discord DM channel for user %s: %w", job.Args.DiscordID, err)
	}
	if _, err := w.bot.session.ChannelMessageSendComplex(channel.ID, discordDirectMessage(job.Args.Message)); err != nil {
		return fmt.Errorf("send Discord DM to user %s: %w", job.Args.DiscordID, err)
	}
	return nil
}
