package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindAnnounceRaidLog = "announce-raid-log"

type ArgsAnnounceRaidLog struct {
	LogGroupID      uuid.UUID `json:"log_group_id"`
	InstanceOrdinal int32     `json:"instance_ordinal"`
}

func (a ArgsAnnounceRaidLog) Kind() string { return KindAnnounceRaidLog }

func (a ArgsAnnounceRaidLog) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:    riverconst.QueueDiscordAnnouncements,
		Priority: riverconst.PriorityDefault,
		// Creating a Discord message and persisting its returned ID cannot be
		// atomic. Retrying after Discord accepted the message but before the ID
		// was stored could create a duplicate, so delivery is attempted once.
		MaxAttempts: 1,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			// Excluding running allows one follow-up rebuild to queue while the
			// current worker is rendering older database state.
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRetryable,
			},
		},
	}
}

type discordAnnouncementMessenger interface {
	ChannelMessageSendEmbed(string, *discordgo.MessageEmbed, ...discordgo.RequestOption) (*discordgo.Message, error)
	ChannelMessageEditEmbed(string, string, *discordgo.MessageEmbed, ...discordgo.RequestOption) (*discordgo.Message, error)
	ChannelMessageDelete(string, string, ...discordgo.RequestOption) error
}

type WorkerAnnounceRaidLog struct {
	river.WorkerDefaults[ArgsAnnounceRaidLog]
	bot       *Bot
	messenger discordAnnouncementMessenger
}

func (b *Bot) NewWorkerAnnounceRaidLog() river.Worker[ArgsAnnounceRaidLog] {
	return &WorkerAnnounceRaidLog{bot: b, messenger: b.session}
}

type announcementReconciliation struct {
	announcement database.GuildDiscordLogAnnouncement
	obsolete     *database.GuildDiscordLogAnnouncement
}

func effectiveRunID(instance database.LogInstance) uuid.UUID {
	if instance.DuplicateGroupID.Valid {
		return instance.DuplicateGroupID.UUID
	}
	return instance.ID
}

func announcementScopeMatches(scope, category string) bool {
	switch scope {
	case "all":
		return category == "raid" || category == "dungeon"
	case "raids_only":
		return category == "raid"
	case "dungeons_only":
		return category == "dungeon"
	default:
		return false
	}
}

func (w *WorkerAnnounceRaidLog) reconcile(
	ctx context.Context,
	instance database.LogInstance,
	ordinal int32,
	channelID string,
) (announcementReconciliation, error) {
	var result announcementReconciliation
	err := w.bot.config.DB.InTx(ctx, func(tx database.Store) error {
		source, sourceErr := tx.GetDiscordAnnouncementSource(ctx, database.GetDiscordAnnouncementSourceParams{
			LogGroupID: instance.LogGroupID, InstanceOrdinal: ordinal,
		})
		if errors.Is(sourceErr, pgx.ErrNoRows) && instance.HashedSlug.Valid {
			bySlug, slugErr := tx.GetDiscordAnnouncementSourceBySlug(ctx, instance.HashedSlug)
			sourceErr = slugErr
			if slugErr == nil {
				source = database.GetDiscordAnnouncementSourceRow(bySlug)
			}
			if sourceErr == nil && (source.GuildDiscordLogAnnouncementSource.LogGroupID != instance.LogGroupID ||
				source.GuildDiscordLogAnnouncementSource.InstanceOrdinal != ordinal) {
				if err := tx.DeleteDiscordAnnouncementSource(ctx, database.DeleteDiscordAnnouncementSourceParams{
					LogGroupID:      source.GuildDiscordLogAnnouncementSource.LogGroupID,
					InstanceOrdinal: source.GuildDiscordLogAnnouncementSource.InstanceOrdinal,
				}); err != nil {
					return err
				}
			}
		}
		if sourceErr != nil && !errors.Is(sourceErr, pgx.ErrNoRows) {
			return sourceErr
		}

		runID := effectiveRunID(instance)
		byRun, runErr := tx.GetDiscordAnnouncementByRun(ctx, database.GetDiscordAnnouncementByRunParams{
			GuildID: instance.GuildID.UUID, RunID: runID,
		})
		if runErr != nil && !errors.Is(runErr, pgx.ErrNoRows) {
			return runErr
		}

		slug := instance.HashedSlug
		switch {
		case sourceErr == nil && runErr == nil && source.GuildDiscordLogAnnouncement.ID != byRun.ID:
			old := source.GuildDiscordLogAnnouncement
			if err := tx.MoveDiscordAnnouncementSources(ctx, database.MoveDiscordAnnouncementSourcesParams{
				ToAnnouncementID: byRun.ID, FromAnnouncementID: old.ID,
			}); err != nil {
				return err
			}
			if err := tx.DeleteDiscordAnnouncement(ctx, old.ID); err != nil {
				return err
			}
			result.announcement = byRun
			result.obsolete = &old
		case sourceErr == nil:
			current := source.GuildDiscordLogAnnouncement
			if current.RunID != runID {
				var err error
				current, err = tx.UpdateDiscordAnnouncementRun(ctx, database.UpdateDiscordAnnouncementRunParams{RunID: runID, ID: current.ID})
				if err != nil {
					return err
				}
			}
			result.announcement = current
		case runErr == nil:
			result.announcement = byRun
		case errors.Is(sourceErr, pgx.ErrNoRows) && errors.Is(runErr, pgx.ErrNoRows):
			created, err := tx.UpsertDiscordAnnouncement(ctx, database.UpsertDiscordAnnouncementParams{
				GuildID: instance.GuildID.UUID, RunID: runID, DiscordChannelID: channelID,
			})
			if err != nil {
				return err
			}
			result.announcement = created
		}

		_, err := tx.UpsertDiscordAnnouncementSource(ctx, database.UpsertDiscordAnnouncementSourceParams{
			AnnouncementID:  result.announcement.ID,
			InstanceSlug:    slug,
			LogGroupID:      instance.LogGroupID,
			InstanceOrdinal: ordinal,
		})
		return err
	}, nil)
	return result, err
}

func (w *WorkerAnnounceRaidLog) Work(ctx context.Context, job *river.Job[ArgsAnnounceRaidLog]) error {
	if !w.bot.Available() {
		return nil
	}
	instanceID, err := w.bot.config.DB.GetLogGroupInstanceIDByOrdinal(ctx, database.GetLogGroupInstanceIDByOrdinalParams{
		LogGroupID: job.Args.LogGroupID, InstanceOrdinal: job.Args.InstanceOrdinal,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("resolve instance ordinal: %w", err)
	}
	instance, err := w.bot.config.DB.GetLogInstanceForDiscordAnnouncement(ctx, instanceID)
	if err != nil {
		return fmt.Errorf("load instance: %w", err)
	}
	if !instance.GuildID.Valid || !instance.Category.Valid {
		return nil
	}
	installation, err := w.bot.config.DB.GetGuildDiscordInstallation(ctx, instance.GuildID.UUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load Discord installation: %w", err)
	}
	if !installation.AnnounceRaidLogs || !installation.AnnounceRaidLogsChannelID.Valid ||
		!announcementScopeMatches(installation.AnnounceRaidLogsScope, instance.Category.String) {
		return nil
	}

	reconciled, err := w.reconcile(ctx, instance, job.Args.InstanceOrdinal, installation.AnnounceRaidLogsChannelID.String)
	if err != nil {
		return fmt.Errorf("reconcile announcement: %w", err)
	}
	if reconciled.obsolete != nil {
		w.deleteObsoleteMessage(reconciled.obsolete)
	}

	announcement := reconciled.announcement
	embed, err := w.buildAnnouncement(ctx, announcement.RunID)
	if err != nil {
		return err
	}
	if w.messenger == nil {
		return nil
	}

	if announcement.DiscordMessageID.Valid {
		if announcement.DiscordChannelID != installation.AnnounceRaidLogsChannelID.String {
			w.bot.logger.Info("Discord announcement channel changed; leaving existing message untouched",
				slog.String("announcement_id", announcement.ID.String()))
			return nil
		}
		if _, err := w.messenger.ChannelMessageEditEmbed(announcement.DiscordChannelID, announcement.DiscordMessageID.String, embed); err != nil {
			if discordMessageUnreachable(err) {
				w.bot.logger.Warn("Discord announcement is no longer reachable", slog.String("error", err.Error()))
				return nil
			}
			return fmt.Errorf("edit Discord announcement: %w", err)
		}
		return nil
	}

	// Claim creation before contacting Discord. If Discord accepts the message but
	// Chronicle fails before storing its ID, subsequent jobs intentionally skip
	// creation rather than risk spamming the channel with duplicates.
	announcement, err = w.bot.config.DB.ClaimDiscordAnnouncementDelivery(ctx, announcement.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("claim Discord announcement delivery: %w", err)
	}

	message, err := w.messenger.ChannelMessageSendEmbed(installation.AnnounceRaidLogsChannelID.String, embed)
	if err != nil {
		return fmt.Errorf("send Discord announcement: %w", err)
	}
	_, err = w.bot.config.DB.SetDiscordAnnouncementMessage(ctx, database.SetDiscordAnnouncementMessageParams{
		DiscordChannelID: installation.AnnounceRaidLogsChannelID.String,
		DiscordMessageID: pgtype.Text{String: message.ID, Valid: true},
		ID:               announcement.ID,
	})
	if err != nil {
		return fmt.Errorf("persist Discord message ID: %w", err)
	}
	return nil
}

func (w *WorkerAnnounceRaidLog) deleteObsoleteMessage(announcement *database.GuildDiscordLogAnnouncement) {
	if w.messenger == nil || !announcement.DiscordMessageID.Valid {
		return
	}
	if err := w.messenger.ChannelMessageDelete(announcement.DiscordChannelID, announcement.DiscordMessageID.String); err != nil {
		w.bot.logger.Warn("failed to delete superseded Discord announcement", slog.String("error", err.Error()))
	}
}

func (w *WorkerAnnounceRaidLog) instanceURL(id uuid.UUID, slug pgtype.Text) string {
	linkID := id.String()
	if slug.Valid && slug.String != "" {
		linkID = slug.String
	}
	return fmt.Sprintf("%s/instances/%s", strings.TrimRight(w.bot.config.AccessURL, "/"), url.PathEscape(linkID))
}

func (w *WorkerAnnounceRaidLog) buildAnnouncement(ctx context.Context, runID uuid.UUID) (*discordgo.MessageEmbed, error) {
	logs, err := w.bot.config.DB.ListInstancesForDiscordAnnouncement(ctx, runID)
	if err != nil {
		return nil, fmt.Errorf("list announcement logs: %w", err)
	}
	if len(logs) == 0 {
		return nil, fmt.Errorf("announcement run %s has no instances", runID)
	}

	best := logs[0]
	bestEncounters, err := w.bot.config.DB.ListDiscordAnnouncementEncounters(ctx, best.ID)
	if err != nil {
		return nil, fmt.Errorf("list announcement encounters: %w", err)
	}
	for _, candidate := range logs[1:] {
		encounters, err := w.bot.config.DB.ListDiscordAnnouncementEncounters(ctx, candidate.ID)
		if err != nil {
			return nil, fmt.Errorf("list announcement encounters: %w", err)
		}
		if len(encounters) > len(bestEncounters) {
			best = candidate
			bestEncounters = encounters
		}
	}

	links := make([]string, 0, len(logs))
	for _, log := range logs {
		label := log.UploaderName
		if log.RecorderName != "" {
			label += " · " + log.RecorderName
		}
		links = append(links, fmt.Sprintf("[%s](%s)", label, w.instanceURL(log.ID, log.HashedSlug)))
	}

	bosses := make([]string, 0, len(bestEncounters))
	for _, encounter := range bestEncounters {
		marker := "❌"
		if encounter.KillType == database.KillTypeClean || encounter.KillType == database.KillTypePartial {
			marker = "✅"
		}
		bosses = append(bosses, marker+" "+encounter.Name)
	}
	if len(bosses) == 0 {
		bosses = append(bosses, "No boss encounters recorded")
	}

	return &discordgo.MessageEmbed{
		Title:       best.Name,
		URL:         w.instanceURL(best.ID, best.HashedSlug),
		Description: strings.Join(bosses, "\n"),
		Fields: []*discordgo.MessageEmbedField{
			{Name: "Logs", Value: strings.Join(links, "\n")},
		},
		Color: 0x5865F2,
	}, nil
}

func discordMessageUnreachable(err error) bool {
	var restErr *discordgo.RESTError
	if !errors.As(err, &restErr) || restErr.Message == nil {
		return false
	}
	switch restErr.Message.Code {
	case 10003, 10008, 50001, 50013:
		return true
	default:
		return false
	}
}
