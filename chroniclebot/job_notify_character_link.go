package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/bwmarrin/discordgo"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindNotifyCharacterLinkDecision = "notify-character-link-decision"

// ArgsNotifyCharacterLinkDecision delivers a photo-proof decision to the
// applicant's linked Discord account.
type ArgsNotifyCharacterLinkDecision struct {
	ProofID            string   `json:"proof_id"`
	DiscordID          string   `json:"discord_id"`
	Status             string   `json:"status"`
	URL                string   `json:"url,omitempty"`
	TenantName         string   `json:"tenant_name"`
	ApprovedCharacters []string `json:"approved_characters,omitempty"`
	RejectedCharacters []string `json:"rejected_characters,omitempty"`
	Response           string   `json:"response,omitempty"`
}

func (ArgsNotifyCharacterLinkDecision) Kind() string { return KindNotifyCharacterLinkDecision }
func (ArgsNotifyCharacterLinkDecision) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueDiscordAnnouncements,
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

// CharacterLinkDecisionInserter is the small River surface needed to enqueue DMs.
type CharacterLinkDecisionInserter interface {
	Insert(context.Context, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

// EnqueueCharacterLinkDecision is a no-op when Discord is disabled or the
// applicant has no linked Discord account. Callers treat insertion errors as
// best effort and must not fail a completed proof decision.
func EnqueueCharacterLinkDecision(ctx context.Context, queue CharacterLinkDecisionInserter, bot *Bot, args ArgsNotifyCharacterLinkDecision) error {
	if bot == nil || bot.Disabled() || args.DiscordID == "" {
		return nil
	}
	if queue == nil {
		return errors.New("character-link decision notification queue unavailable")
	}
	_, err := queue.Insert(ctx, args, nil)
	return err
}

type WorkerNotifyCharacterLinkDecision struct {
	river.WorkerDefaults[ArgsNotifyCharacterLinkDecision]
	bot *Bot
}

func (b *Bot) NewWorkerNotifyCharacterLinkDecision() river.Worker[ArgsNotifyCharacterLinkDecision] {
	return &WorkerNotifyCharacterLinkDecision{bot: b}
}

func characterLinkDecisionMessage(args ArgsNotifyCharacterLinkDecision) *discordgo.MessageSend {
	title := "Character link request decided"
	description := "Your character-link photo proof has been reviewed."
	color := 0x5865F2
	switch args.Status {
	case "approved":
		title = "Character link approved"
		description = "Your character-link photo proof was approved."
		color = 0x57F287
	case "partial":
		title = "Character link partially approved"
		description = "Some characters in your character-link photo proof were approved."
		color = 0xFEE75C
	case "rejected":
		title = "Character link rejected"
		description = "Your character-link photo proof was rejected."
		color = 0xED4245
	}

	tenantName := strings.TrimSpace(args.TenantName)
	if tenantName == "" {
		tenantName = "Unknown site"
	}
	fields := make([]*discordgo.MessageEmbedField, 0, 4)
	fields = append(fields, &discordgo.MessageEmbedField{Name: "Site", Value: tenantName})
	if len(args.ApprovedCharacters) > 0 {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:  "Approved characters",
			Value: discordEmbedFieldValue(strings.Join(args.ApprovedCharacters, "\n")),
		})
	}
	if len(args.RejectedCharacters) > 0 {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:  "Rejected characters",
			Value: discordEmbedFieldValue(strings.Join(args.RejectedCharacters, "\n")),
		})
	}
	if strings.TrimSpace(args.Response) != "" {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:  "Reviewer message",
			Value: discordEmbedFieldValue(strings.TrimSpace(args.Response)),
		})
	}

	return &discordgo.MessageSend{
		Embeds: []*discordgo.MessageEmbed{{
			Title:       title,
			Description: description,
			URL:         args.URL,
			Fields:      fields,
			Color:       color,
		}},
		AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}},
	}
}

func discordEmbedFieldValue(value string) string {
	const maxRunes = 1024
	runes := []rune(value)
	if len(runes) <= maxRunes {
		return value
	}
	return string(runes[:maxRunes-3]) + "..."
}

func (w *WorkerNotifyCharacterLinkDecision) Work(_ context.Context, job *river.Job[ArgsNotifyCharacterLinkDecision]) error {
	if w.bot.session == nil {
		return errors.New("discord bot session unavailable")
	}
	channel, err := w.bot.session.UserChannelCreate(job.Args.DiscordID)
	if err != nil {
		return fmt.Errorf("create Discord DM channel for user %s: %w", job.Args.DiscordID, err)
	}
	if _, err := w.bot.session.ChannelMessageSendComplex(channel.ID, characterLinkDecisionMessage(job.Args)); err != nil {
		return fmt.Errorf("send character-link decision DM to user %s: %w", job.Args.DiscordID, err)
	}
	return nil
}
