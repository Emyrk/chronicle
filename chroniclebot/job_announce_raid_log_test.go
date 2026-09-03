package chroniclebot

import (
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestReconcileReparseAndDuplicateMerge(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "discord-announcement-" + uuid.NewString()[:8]})
	require.NoError(t, err)
	realmID := uuid.MustParse("bcf173a7-c94a-49fe-8930-27435d722fb7")
	guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Test Guild " + uuid.NewString()[:8], CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)

	worker := &WorkerAnnounceRaidLog{bot: &Bot{config: Config{DB: store}, logger: testutil.Logger(t)}}
	makeInstance := func(logGroupID uuid.UUID, slug string, start time.Time) database.LogInstance {
		t.Helper()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
			CreatedAt: database.Timestamptz(start), UpdatedAt: database.Timestamptz(start),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
		instance, err := store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: uuid.New(), RealmID: realmID, LogGroupID: logGroupID, Name: "Molten Core",
			HashedSlug: pgtype.Text{String: slug, Valid: true}, GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true},
			StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(start.Add(time.Hour)),
			Capabilities: []string{}, Category: pgtype.Text{String: "raid", Valid: true},
		})
		require.NoError(t, err)
		return instance
	}

	logA, logB := uuid.New(), uuid.New()
	instanceA := makeInstance(logA, "slug-a", time.Now().Add(-2*time.Hour))
	instanceB := makeInstance(logB, "slug-b", time.Now().Add(-time.Hour))

	annA, err := worker.reconcile(ctx, instanceA, 0, "channel")
	require.NoError(t, err)
	annB, err := worker.reconcile(ctx, instanceB, 0, "channel")
	require.NoError(t, err)
	require.NotEqual(t, annA.announcement.ID, annB.announcement.ID)

	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: instanceA.ID, Valid: true}, Ids: []uuid.UUID{instanceA.ID, instanceB.ID},
	}))
	instanceB, err = store.GetLogInstanceForDiscordAnnouncement(ctx, instanceB.ID)
	require.NoError(t, err)
	merged, err := worker.reconcile(ctx, instanceB, 0, "channel")
	require.NoError(t, err)
	require.Equal(t, annA.announcement.ID, merged.announcement.ID)
	require.Equal(t, annB.announcement.ID, merged.obsolete.ID)
	sources, err := store.ListDiscordAnnouncementSources(ctx, merged.announcement.ID)
	require.NoError(t, err)
	require.Len(t, sources, 2)

	require.NoError(t, store.DeleteAllParsedLogsByGroupID(ctx, logA))
	require.NoError(t, store.InsertParsedLogGroup(ctx, logA))
	reparsed, err := store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: uuid.New(), RealmID: realmID, LogGroupID: logA, Name: "Molten Core",
		HashedSlug: pgtype.Text{String: "slug-a", Valid: true}, GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true},
		StartTime: database.Timestamptz(time.Now()), EndTime: database.Timestamptz(time.Now().Add(time.Hour)),
		Capabilities: []string{}, Category: pgtype.Text{String: "raid", Valid: true},
	})
	require.NoError(t, err)
	reconciled, err := worker.reconcile(ctx, reparsed, 0, "channel")
	require.NoError(t, err)
	require.Equal(t, merged.announcement.ID, reconciled.announcement.ID)
}

func TestClaimDiscordAnnouncementDeliveryAtMostOnce(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "delivery-claim-" + uuid.NewString()[:8]})
	require.NoError(t, err)
	realmID := uuid.MustParse("bcf173a7-c94a-49fe-8930-27435d722fb7")
	guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{
		RealmID: realmID, Name: "Claim Guild " + uuid.NewString()[:8], CreatedAt: database.Timestamptz(time.Now()),
	})
	require.NoError(t, err)
	announcement, err := store.UpsertDiscordAnnouncement(ctx, database.UpsertDiscordAnnouncementParams{
		GuildID: guild.ID, RunID: uuid.New(), DiscordChannelID: "channel",
	})
	require.NoError(t, err)

	claimed, err := store.ClaimDiscordAnnouncementDelivery(ctx, announcement.ID)
	require.NoError(t, err)
	require.True(t, claimed.DeliveryAttemptedAt.Valid)
	_, err = store.ClaimDiscordAnnouncementDelivery(ctx, announcement.ID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

type errorAnnouncementMessenger struct {
	sendErr error
	sent    *discordgo.MessageSend
}

func (m *errorAnnouncementMessenger) ChannelMessageSendComplex(_ string, message *discordgo.MessageSend, _ ...discordgo.RequestOption) (*discordgo.Message, error) {
	m.sent = message
	return nil, m.sendErr
}

func (*errorAnnouncementMessenger) ChannelMessageEditComplex(*discordgo.MessageEdit, ...discordgo.RequestOption) (*discordgo.Message, error) {
	return nil, nil
}

func (*errorAnnouncementMessenger) ChannelMessageDelete(string, string, ...discordgo.RequestOption) error {
	return nil
}

func requireAnnouncementField(t *testing.T, embed *discordgo.MessageEmbed, name string) *discordgo.MessageEmbedField {
	t.Helper()
	for _, field := range embed.Fields {
		if field.Name == name {
			return field
		}
	}
	require.FailNow(t, "announcement field not found", name)
	return nil
}

func TestAnnouncementDeliveryErrorIsPersisted(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "delivery-error-" + uuid.NewString()[:8]})
	require.NoError(t, err)
	realmID := uuid.MustParse("bcf173a7-c94a-49fe-8930-27435d722fb7")
	guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{
		RealmID: realmID, Name: "Delivery Error Guild " + uuid.NewString()[:8], CreatedAt: database.Timestamptz(time.Now()),
	})
	require.NoError(t, err)
	_, err = store.UpsertGuildDiscordInstallation(ctx, database.UpsertGuildDiscordInstallationParams{
		GuildID: guild.ID, DiscordGuildID: "discord-guild", DiscordGuildName: "Discord Guild", InstalledBy: userID,
	})
	require.NoError(t, err)
	_, err = store.UpdateGuildDiscordRaidLogAnnouncements(ctx, database.UpdateGuildDiscordRaidLogAnnouncementsParams{
		GuildID: guild.ID, AnnounceRaidLogs: true, AnnounceRaidLogsScope: "raids_only",
		AnnounceRaidLogsChannelID: pgtype.Text{String: "channel", Valid: true},
	})
	require.NoError(t, err)

	startedAt := time.Date(2026, time.August, 14, 19, 0, 0, 0, time.UTC)
	insertLogGroup := func(logGroupID uuid.UUID, createdAt time.Time) {
		t.Helper()
		_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
			CreatedAt: database.Timestamptz(createdAt), UpdatedAt: database.Timestamptz(createdAt),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	}
	insertSpeedrun := func(instanceID uuid.UUID, start time.Time, duration time.Duration) {
		t.Helper()
		require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
			InstanceID: instanceID, InstanceName: "Molten Core", RealmID: realmID,
			GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true}, Qualified: true,
			StartTime: database.Timestamptz(start), CompletionTime: database.Timestamptz(start.Add(duration)),
			DurationMs: int64(duration / time.Millisecond), Proof: []byte(`{"proof":[]}`),
		}))
	}

	previousLogGroupID := uuid.New()
	insertLogGroup(previousLogGroupID, startedAt.Add(-7*24*time.Hour))
	previousInstance, err := store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: uuid.New(), RealmID: realmID, LogGroupID: previousLogGroupID, Name: "Molten Core",
		GuildID:   uuid.NullUUID{UUID: guild.ID, Valid: true},
		StartTime: database.Timestamptz(startedAt.Add(-7 * 24 * time.Hour)), EndTime: database.Timestamptz(startedAt.Add(-7*24*time.Hour + 75*time.Minute)),
		Capabilities: []string{}, Category: pgtype.Text{String: "raid", Valid: true},
	})
	require.NoError(t, err)
	insertSpeedrun(previousInstance.ID, previousInstance.StartTime.Time, 75*time.Minute)

	logGroupID := uuid.New()
	insertLogGroup(logGroupID, startedAt.Add(24*time.Hour))
	instance, err := store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: uuid.New(), RealmID: realmID, LogGroupID: logGroupID, Name: "Molten Core",
		HashedSlug: pgtype.Text{String: "delivery-error-slug", Valid: true}, GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true},
		StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(65 * time.Minute)),
		Capabilities: []string{}, Category: pgtype.Text{String: "raid", Valid: true},
	})
	require.NoError(t, err)
	insertSpeedrun(instance.ID, startedAt, time.Hour)

	insertEncounter := func(name string, killType database.KillType, offset time.Duration) {
		t.Helper()
		end := startedAt.Add(offset)
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: uuid.New(), InstanceID: instance.ID, Name: name, KillType: killType,
			Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(end.Add(-time.Minute)), EndTime: database.Timestamptz(end),
		})
		require.NoError(t, err)
	}
	insertEncounter("Lucifron", database.KillTypeClean, 10*time.Minute)
	insertEncounter("Lucifron", database.KillTypeClean, 12*time.Minute)
	insertEncounter("Magmadar", database.KillTypePartial, 20*time.Minute)
	insertEncounter("Gehennas", database.KillTypeWipe, 30*time.Minute)

	discordErr := errors.New(`HTTP 403 Forbidden, {"message": "Missing Permissions", "code": 50013}`)
	bot := &Bot{config: Config{DB: store, AccessURL: "https://chronicle.example"}, logger: testutil.Logger(t)}
	messenger := &errorAnnouncementMessenger{sendErr: discordErr}
	worker := &WorkerAnnounceRaidLog{bot: bot, messenger: messenger}
	err = worker.Work(ctx, &river.Job[ArgsAnnounceRaidLog]{Args: ArgsAnnounceRaidLog{LogGroupID: logGroupID, InstanceOrdinal: 0}})
	require.ErrorContains(t, err, "Missing Permissions")
	require.NotNil(t, messenger.sent)
	require.NotNil(t, messenger.sent.AllowedMentions)
	require.Empty(t, messenger.sent.AllowedMentions.Parse)
	require.Empty(t, messenger.sent.Content)
	require.Len(t, messenger.sent.Embeds, 1)
	embed := messenger.sent.Embeds[0]
	require.Equal(t, "RAID UPLOAD", embed.Author.Name)
	require.Equal(t, "Molten Core · 1h", embed.Title)
	require.Empty(t, embed.Description)
	require.Empty(t, embed.Timestamp)
	require.NotZero(t, embed.Color)
	require.Equal(t, guild.Name+" · Molten Core · Aug 14, 2026", embed.Footer.Text)
	require.Equal(t, "2 / 3", requireAnnouncementField(t, embed, "BOSSES KILLED").Value)
	require.Equal(t, "+20% faster", requireAnnouncementField(t, embed, "VS. GUILD AVG").Value)
	require.NotEmpty(t, requireAnnouncementField(t, embed, "REALM").Value)

	attempts, err := store.ListGuildDiscordAnnouncementAttempts(ctx, database.ListGuildDiscordAnnouncementAttemptsParams{
		GuildID: guild.ID, LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, attempts, 1)
	announcement := attempts[0].GuildDiscordLogAnnouncement
	require.True(t, announcement.DeliveryAttemptedAt.Valid)
	require.Equal(t, "send Discord announcement: "+discordErr.Error(), announcement.DeliveryError.String)
}

func TestHasDiscordAnnouncementPermissions(t *testing.T) {
	t.Parallel()

	required := int64(discordgo.PermissionViewChannel |
		discordgo.PermissionSendMessages |
		discordgo.PermissionEmbedLinks |
		discordgo.PermissionCreatePublicThreads |
		discordgo.PermissionSendMessagesInThreads)
	require.True(t, hasDiscordAnnouncementPermissions(required))
	for _, permission := range []int64{
		discordgo.PermissionEmbedLinks,
		discordgo.PermissionCreatePublicThreads,
		discordgo.PermissionSendMessagesInThreads,
	} {
		require.False(t, hasDiscordAnnouncementPermissions(required&^permission))
	}
}

func TestArgsAnnounceRaidLogInsertOpts(t *testing.T) {
	t.Parallel()

	opts := (ArgsAnnounceRaidLog{}).InsertOpts()
	require.Equal(t, riverconst.QueueDiscordAnnouncements, opts.Queue)
	require.Equal(t, 1, opts.MaxAttempts)
	require.True(t, opts.UniqueOpts.ByArgs)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStatePending)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRunning)
}

func TestAnnouncementScopeMatches(t *testing.T) {
	t.Parallel()

	tests := []struct {
		scope, category string
		want            bool
	}{
		{scope: "all", category: "raid", want: true},
		{scope: "all", category: "dungeon", want: true},
		{scope: "raids_only", category: "raid", want: true},
		{scope: "raids_only", category: "dungeon", want: false},
		{scope: "dungeons_only", category: "dungeon", want: true},
		{scope: "dungeons_only", category: "raid", want: false},
		{scope: "invalid", category: "raid", want: false},
	}
	for _, test := range tests {
		require.Equal(t, test.want, announcementScopeMatches(test.scope, test.category))
	}
}

func TestEffectiveRunID(t *testing.T) {
	t.Parallel()

	instanceID := uuid.New()
	duplicateID := uuid.New()
	require.Equal(t, instanceID, effectiveRunID(database.LogInstance{ID: instanceID}))
	require.Equal(t, duplicateID, effectiveRunID(database.LogInstance{
		ID:               instanceID,
		DuplicateGroupID: uuid.NullUUID{UUID: duplicateID, Valid: true},
	}))
}

func TestAnnouncementFormatting(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, time.September, 1, 19, 0, 0, 0, time.UTC)
	require.Equal(t, "51m", formatAnnouncementDuration(database.Timestamptz(start), database.Timestamptz(start.Add(51*time.Minute))))
	require.Equal(t, "1h 15m", formatAnnouncementDuration(database.Timestamptz(start), database.Timestamptz(start.Add(75*time.Minute))))
	require.Equal(t, "1h", announcementDuration(database.ListInstancesForDiscordAnnouncementRow{
		StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(start.Add(75 * time.Minute)),
		ClearDurationMs: pgtype.Int8{Int64: int64(time.Hour / time.Millisecond), Valid: true},
	}))
	require.Equal(t, "+20% faster", guildAverageComparison(int64(time.Hour/time.Millisecond), int64(75*time.Minute/time.Millisecond)))
	require.Equal(t, "-20% slower", guildAverageComparison(int64(90*time.Minute/time.Millisecond), int64(75*time.Minute/time.Millisecond)))
	require.Equal(t, "0% vs average", guildAverageComparison(int64(time.Hour/time.Millisecond), int64(time.Hour/time.Millisecond)))
	require.Empty(t, guildAverageComparison(int64(time.Hour/time.Millisecond), 0))
	require.Equal(t, "Heroic · 40-man", announcementVariant("Heroic", 40))
	require.Equal(t, announcementColor("Molten Core"), announcementColor("molten core"))
	require.NotZero(t, announcementColor("Onyxia's Lair"))
}

func TestInstanceURL(t *testing.T) {
	t.Parallel()

	id := uuid.New()
	worker := &WorkerAnnounceRaidLog{bot: &Bot{config: Config{
		AccessURL:     "https://legacy.chronicle.example/",
		PrimaryDomain: "chronicle.example",
	}}}
	require.Equal(t, "https://legacy.chronicle.example/instances/durable-slug", worker.instanceURL(
		id,
		pgtype.Text{String: "durable-slug", Valid: true},
		pgtype.Text{},
	))
	require.Equal(t, "https://epoch.chronicle.example/instances/durable-slug", worker.instanceURL(
		id,
		pgtype.Text{String: "durable-slug", Valid: true},
		pgtype.Text{String: "epoch", Valid: true},
	))
	require.Equal(t, "https://legacy.chronicle.example/instances/"+id.String(), worker.instanceURL(
		id,
		pgtype.Text{},
		pgtype.Text{},
	))
}
