package spice

import (
	"context"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/spice/policy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func (sdb *Spice) DeleteAllParsedLogsByGroupID(ctx context.Context, id uuid.UUID) error {
	return sdb.db.DeleteAllParsedLogsByGroupID(ctx, id)
}

func (sdb *Spice) DeleteThisQuery(ctx context.Context) error {
	return sdb.db.DeleteThisQuery(ctx)
}

func (sdb *Spice) DeleteWoWLogGroup(ctx context.Context, id uuid.UUID) error {
	return sdb.db.DeleteWoWLogGroup(ctx, id)
}

func (sdb *Spice) EncountersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceEncounter, error) {
	return sdb.db.EncountersByInstanceID(ctx, instanceID)
}

func (sdb *Spice) GetInstanceEncounterCharacterFights(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceEncounterHostile, error) {
	return sdb.db.GetInstanceEncounterCharacterFights(ctx, instanceID)
}

func (sdb *Spice) GetInstanceYoutubeData(ctx context.Context, logInstanceID uuid.UUID) (database.LogInstanceYoutubeTimestamped, error) {
	return sdb.db.GetInstanceYoutubeData(ctx, logInstanceID)
}

func (sdb *Spice) GetUserAuthByLinkedID(ctx context.Context, arg database.GetUserAuthByLinkedIDParams) (database.UserAuthLink, error) {
	return sdb.db.GetUserAuthByLinkedID(ctx, arg)
}

func (sdb *Spice) GetUserAuthSessionByID(ctx context.Context, id uuid.UUID) (database.UserAuthSession, error) {
	return sdb.db.GetUserAuthSessionByID(ctx, id)
}

func (sdb *Spice) GetUserByID(ctx context.Context, id uuid.UUID) (database.User, error) {
	return sdb.db.GetUserByID(ctx, id)
}

func (sdb *Spice) GetWoWLogFilesByGroupID(ctx context.Context, wowLogID uuid.UUID) ([]database.LogFile, error) {
	return sdb.db.GetWoWLogFilesByGroupID(ctx, wowLogID)
}

func (sdb *Spice) GetWoWLogGroupByID(ctx context.Context, id uuid.UUID) (database.GetWoWLogGroupByIDRow, error) {
	return sdb.db.GetWoWLogGroupByID(ctx, id)
}

func (sdb *Spice) GetWoWLogGroupsByOwner(ctx context.Context, owner uuid.UUID) ([]database.GetWoWLogGroupsByOwnerRow, error) {
	return sdb.db.GetWoWLogGroupsByOwner(ctx, owner)
}

func (sdb *Spice) InsertEncounter(ctx context.Context, arg database.InsertEncounterParams) (database.LogInstanceEncounter, error) {
	return sdb.db.InsertEncounter(ctx, arg)
}

func (sdb *Spice) InsertEncounterCharacterFights(ctx context.Context, arg []database.InsertEncounterCharacterFightsParams) *database.InsertEncounterCharacterFightsBatchResults {
	return sdb.db.InsertEncounterCharacterFights(ctx, arg)
}

func (sdb *Spice) InsertInstance(ctx context.Context, arg database.InsertInstanceParams) (database.LogInstance, error) {
	builder := policy.New()
	builder.Log_instance(arg.ID).Raid_log(builder.Raid_log(arg.LogGroupID))

	return WithRelations(ctx, sdb, builder.Relationships, sdb.db.InsertInstance, arg)
}

func (sdb *Spice) InsertInstancePlayers(ctx context.Context, arg []database.InsertInstancePlayersParams) *database.InsertInstancePlayersBatchResults {
	return sdb.db.InsertInstancePlayers(ctx, arg)
}

func (sdb *Spice) InsertInstanceUnits(ctx context.Context, arg []database.InsertInstanceUnitsParams) *database.InsertInstanceUnitsBatchResults {
	return sdb.db.InsertInstanceUnits(ctx, arg)
}

func (sdb *Spice) InsertLogFile(ctx context.Context, arg database.InsertLogFileParams) (database.LogFile, error) {
	return sdb.db.InsertLogFile(ctx, arg)
}

func (sdb *Spice) InsertLogInstanceEvents(ctx context.Context, arg []database.InsertLogInstanceEventsParams) *database.InsertLogInstanceEventsBatchResults {
	return sdb.db.InsertLogInstanceEvents(ctx, arg)
}

func (sdb *Spice) InsertParsedLogGroup(ctx context.Context, id uuid.UUID) error {
	return sdb.db.InsertParsedLogGroup(ctx, id)
}

func (sdb *Spice) InsertStampedYoutubeVideo(ctx context.Context, arg database.InsertStampedYoutubeVideoParams) error {
	return sdb.db.InsertStampedYoutubeVideo(ctx, arg)
}

func (sdb *Spice) InsertUser(ctx context.Context, arg database.InsertUserParams) (database.User, error) {
	builder := policy.New()
	user := builder.User(arg.ID)

	// All users start out as log capable.
	builder.GlobalChronicle().Log_capable(user)

	err := sdb.Check(builder.GlobalChronicle().CanCreate_user(ctx))
	if err != nil {
		return database.User{}, err
	}

	return WithRelations(ctx, sdb, builder.Relationships, sdb.InsertUser, arg)
}

func (sdb *Spice) InsertUserAuth(ctx context.Context, arg database.InsertUserAuthParams) (database.UserAuthLink, error) {
	return sdb.db.InsertUserAuth(ctx, arg)
}

func (sdb *Spice) InsertUserAuthSession(ctx context.Context, arg database.InsertUserAuthSessionParams) (database.UserAuthSession, error) {
	return sdb.db.InsertUserAuthSession(ctx, arg)
}

func (sdb *Spice) InsertWoWLogGroup(ctx context.Context, arg database.InsertWoWLogGroupParams) (database.WoWLogGroup, error) {
	builder := policy.New()
	rl := builder.Raid_log(arg.ID)

	rl.Chronicle(builder.GlobalChronicle())
	rl.Owner(builder.User(arg.Owner))

	return WithRelations(ctx, sdb, builder.Relationships, sdb.db.InsertWoWLogGroup, arg)
}

func (sdb *Spice) Instance(ctx context.Context, id uuid.UUID) (database.LogInstance, error) {
	return sdb.db.Instance(ctx, id)
}

func (sdb *Spice) InstanceBySlug(ctx context.Context, hashedSlug pgtype.Text) (database.LogInstance, error) {
	return sdb.db.InstanceBySlug(ctx, hashedSlug)
}

func (sdb *Spice) InstanceEvent(ctx context.Context, arg database.InstanceEventParams) (database.LogInstanceEvent, error) {
	return sdb.db.InstanceEvent(ctx, arg)
}

func (sdb *Spice) InstancePlayersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstancePlayer, error) {
	return sdb.db.InstancePlayersByInstanceID(ctx, instanceID)
}

func (sdb *Spice) InstanceUnitsByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceUnit, error) {
	return sdb.db.InstanceUnitsByInstanceID(ctx, instanceID)
}

func (sdb *Spice) UpdateUserAuthSessionTokens(ctx context.Context, arg database.UpdateUserAuthSessionTokensParams) (database.UserAuthSession, error) {
	return sdb.db.UpdateUserAuthSessionTokens(ctx, arg)
}

func (sdb *Spice) Ping(ctx context.Context) (time.Duration, error) {
	return sdb.db.Ping(ctx)
}
