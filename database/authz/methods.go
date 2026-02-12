package authz

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type interceptor struct {
	Authorizer
	database.Store
}

func (z *interceptor) DeleteAllParsedLogsByGroupID(ctx context.Context, id uuid.UUID) error {
	return z.Store.DeleteAllParsedLogsByGroupID(ctx, id)
}

func (z *interceptor) DeleteThisQuery(ctx context.Context) error {
	return z.Store.DeleteThisQuery(ctx)
}

func (z *interceptor) DeleteWoWLogGroup(ctx context.Context, id uuid.UUID) error {
	b := policy.New().Raid_log(id).Object()
	f := rel.NewFilter(b.Typ, b.ID, "")
	err := z.Delete(ctx, rel.NewPreconditionedFilter(f))
	if err != nil {
		return fmt.Errorf("delete authz relations: %w", err)
	}
	return z.Store.DeleteWoWLogGroup(ctx, id)
}

func (z *interceptor) EncountersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceEncounter, error) {
	return z.Store.EncountersByInstanceID(ctx, instanceID)
}

func (z *interceptor) GetInstanceEncounterCharacterFights(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceEncounterHostile, error) {
	return z.Store.GetInstanceEncounterCharacterFights(ctx, instanceID)
}

func (z *interceptor) GetInstanceYoutubeData(ctx context.Context, logInstanceID uuid.UUID) (database.LogInstanceYoutubeTimestamped, error) {
	return z.Store.GetInstanceYoutubeData(ctx, logInstanceID)
}

func (z *interceptor) GetUserAuthByLinkedID(ctx context.Context, arg database.GetUserAuthByLinkedIDParams) (database.UserAuthLink, error) {
	return z.Store.GetUserAuthByLinkedID(ctx, arg)
}

func (z *interceptor) GetUserAuthLinkByUserID(ctx context.Context, userID uuid.UUID) (database.UserAuthLink, error) {
	return z.Store.GetUserAuthLinkByUserID(ctx, userID)
}

func (z *interceptor) GetUserAuthSessionByID(ctx context.Context, id uuid.UUID) (database.UserAuthSession, error) {
	return z.Store.GetUserAuthSessionByID(ctx, id)
}

func (z *interceptor) GetUserByID(ctx context.Context, id uuid.UUID) (database.User, error) {
	return z.Store.GetUserByID(ctx, id)
}

func (z *interceptor) GetWoWLogFilesByGroupID(ctx context.Context, wowLogID uuid.UUID) ([]database.LogFile, error) {
	return z.Store.GetWoWLogFilesByGroupID(ctx, wowLogID)
}

func (z *interceptor) GetWoWLogGroupByID(ctx context.Context, id uuid.UUID) (database.GetWoWLogGroupByIDRow, error) {
	return z.Store.GetWoWLogGroupByID(ctx, id)
}

func (z *interceptor) GetWoWLogGroupsByOwner(ctx context.Context, owner uuid.UUID) ([]database.GetWoWLogGroupsByOwnerRow, error) {
	return z.Store.GetWoWLogGroupsByOwner(ctx, owner)
}

func (z *interceptor) InsertEncounter(ctx context.Context, arg database.InsertEncounterParams) (database.LogInstanceEncounter, error) {
	return z.Store.InsertEncounter(ctx, arg)
}

func (z *interceptor) InsertEncounterCharacterFights(ctx context.Context, arg []database.InsertEncounterCharacterFightsParams) *database.InsertEncounterCharacterFightsBatchResults {
	return z.Store.InsertEncounterCharacterFights(ctx, arg)
}

func (z *interceptor) InsertInstance(ctx context.Context, arg database.InsertInstanceParams) (database.LogInstance, error) {
	b := policy.New()
	b.Instance(arg.ID).
		PublicWildcard().
		Raid_log(b.Raid_log(arg.LogGroupID))

	_, err := z.Write(ctx, *b.Txn())
	if err != nil {
		return database.LogInstance{}, err
	}
	return z.Store.InsertInstance(ctx, arg)
}

func (z *interceptor) InsertInstancePlayers(ctx context.Context, arg []database.InsertInstancePlayersParams) *database.InsertInstancePlayersBatchResults {
	return z.Store.InsertInstancePlayers(ctx, arg)
}

func (z *interceptor) InsertInstanceUnits(ctx context.Context, arg []database.InsertInstanceUnitsParams) *database.InsertInstanceUnitsBatchResults {
	return z.Store.InsertInstanceUnits(ctx, arg)
}

func (z *interceptor) InsertLogFile(ctx context.Context, arg database.InsertLogFileParams) (database.LogFile, error) {
	return z.Store.InsertLogFile(ctx, arg)
}

func (z *interceptor) InsertLogInstanceEvents(ctx context.Context, arg []database.InsertLogInstanceEventsParams) *database.InsertLogInstanceEventsBatchResults {
	return z.Store.InsertLogInstanceEvents(ctx, arg)
}

func (z *interceptor) InsertParsedLogGroup(ctx context.Context, id uuid.UUID) error {
	return z.Store.InsertParsedLogGroup(ctx, id)
}

func (z *interceptor) InsertStampedYoutubeVideo(ctx context.Context, arg database.InsertStampedYoutubeVideoParams) error {
	return z.Store.InsertStampedYoutubeVideo(ctx, arg)
}

func (z *interceptor) InsertUser(ctx context.Context, arg database.InsertUserParams) (database.User, error) {
	return z.Store.InsertUser(ctx, arg)
}

func (z *interceptor) InsertUserAuth(ctx context.Context, arg database.InsertUserAuthParams) (database.UserAuthLink, error) {
	return z.Store.InsertUserAuth(ctx, arg)
}

func (z *interceptor) InsertUserAuthSession(ctx context.Context, arg database.InsertUserAuthSessionParams) (database.UserAuthSession, error) {
	return z.Store.InsertUserAuthSession(ctx, arg)
}

func (z *interceptor) InsertWoWLogGroup(ctx context.Context, arg database.InsertWoWLogGroupParams) (database.WoWLogGroup, error) {
	b := policy.New()
	b.Raid_log(arg.ID).
		Uploader(b.User(arg.Owner)).
		Chronicle(b.GlobalChronicle())

	_, err := z.Write(ctx, *b.Txn())
	if err != nil {
		return database.WoWLogGroup{}, err
	}
	return z.Store.InsertWoWLogGroup(ctx, arg)
}

func (z *interceptor) Instance(ctx context.Context, id uuid.UUID) (database.LogInstance, error) {
	return z.Store.Instance(ctx, id)
}

func (z *interceptor) InstanceBySlug(ctx context.Context, hashedSlug pgtype.Text) (database.LogInstance, error) {
	return z.Store.InstanceBySlug(ctx, hashedSlug)
}

func (z *interceptor) InstanceEvent(ctx context.Context, arg database.InstanceEventParams) (database.LogInstanceEvent, error) {
	return z.Store.InstanceEvent(ctx, arg)
}

func (z *interceptor) InstancePlayersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstancePlayer, error) {
	return z.Store.InstancePlayersByInstanceID(ctx, instanceID)
}

func (z *interceptor) InstanceUnitsByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceUnit, error) {
	return z.Store.InstanceUnitsByInstanceID(ctx, instanceID)
}

func (z *interceptor) ListAllUsers(ctx context.Context) ([]database.User, error) {
	return z.Store.ListAllUsers(ctx)
}

func (z *interceptor) ListAllWoWLogGroupsWithOwner(ctx context.Context) ([]database.ListAllWoWLogGroupsWithOwnerRow, error) {
	return z.Store.ListAllWoWLogGroupsWithOwner(ctx)
}

func (z *interceptor) UpdateUserAuthSessionTokens(ctx context.Context, arg database.UpdateUserAuthSessionTokensParams) (database.UserAuthSession, error) {
	return z.Store.UpdateUserAuthSessionTokens(ctx, arg)
}
