package authz

import (
	"context"

	"github.com/Emyrk/chronicle/database"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type writer interface {
	Write(ctx context.Context, txn rel.Txn) (writtenAtRevision string, err error)
}

func (z *Authz) Write(ctx context.Context, txn rel.Txn) (writtenAtRevision string, err error) {
	return z.spice.Write(ctx, txn)
}

func (z *AuthzTX) Write(ctx context.Context, txn rel.Txn) (writtenAtRevision string, err error) {
	zed, err := z.parent.Write(ctx, txn)
	if err != nil {
		return zed, err
	}

	// Merge the transaction's relations into the AuthzTX's relations
	// These will be undone on a "revert"
	z.relations.V1Updates = append(z.relations.V1Updates, txn.V1Updates...)

	return zed, nil
}

type interceptor struct {
	writer
	store database.Store
}

func (z *interceptor) DeleteAllParsedLogsByGroupID(ctx context.Context, id uuid.UUID) error {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) DeleteThisQuery(ctx context.Context) error {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) DeleteWoWLogGroup(ctx context.Context, id uuid.UUID) error {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) EncountersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceEncounter, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) GetInstanceEncounterCharacterFights(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceEncounterHostile, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) GetInstanceYoutubeData(ctx context.Context, logInstanceID uuid.UUID) (database.LogInstanceYoutubeTimestamped, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) GetUserAuthByLinkedID(ctx context.Context, arg database.GetUserAuthByLinkedIDParams) (database.UserAuthLink, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) GetUserAuthLinkByUserID(ctx context.Context, userID uuid.UUID) (database.UserAuthLink, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) GetUserAuthSessionByID(ctx context.Context, id uuid.UUID) (database.UserAuthSession, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) GetUserByID(ctx context.Context, id uuid.UUID) (database.User, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) GetWoWLogFilesByGroupID(ctx context.Context, wowLogID uuid.UUID) ([]database.LogFile, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) GetWoWLogGroupByID(ctx context.Context, id uuid.UUID) (database.GetWoWLogGroupByIDRow, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) GetWoWLogGroupsByOwner(ctx context.Context, owner uuid.UUID) ([]database.GetWoWLogGroupsByOwnerRow, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertEncounter(ctx context.Context, arg database.InsertEncounterParams) (database.LogInstanceEncounter, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertEncounterCharacterFights(ctx context.Context, arg []database.InsertEncounterCharacterFightsParams) *database.InsertEncounterCharacterFightsBatchResults {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertInstance(ctx context.Context, arg database.InsertInstanceParams) (database.LogInstance, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertInstancePlayers(ctx context.Context, arg []database.InsertInstancePlayersParams) *database.InsertInstancePlayersBatchResults {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertInstanceUnits(ctx context.Context, arg []database.InsertInstanceUnitsParams) *database.InsertInstanceUnitsBatchResults {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertLogFile(ctx context.Context, arg database.InsertLogFileParams) (database.LogFile, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertLogInstanceEvents(ctx context.Context, arg []database.InsertLogInstanceEventsParams) *database.InsertLogInstanceEventsBatchResults {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertParsedLogGroup(ctx context.Context, id uuid.UUID) error {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertStampedYoutubeVideo(ctx context.Context, arg database.InsertStampedYoutubeVideoParams) error {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertUser(ctx context.Context, arg database.InsertUserParams) (database.User, error) {
	z.writer.Write(ctx, rel.FromObjects())

	user, err := z.store.InsertUser(ctx, arg)
	if err != nil {
		return database.User{}, err
	}
	return user, nil
}

func (z *interceptor) InsertUserAuth(ctx context.Context, arg database.InsertUserAuthParams) (database.UserAuthLink, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertUserAuthSession(ctx context.Context, arg database.InsertUserAuthSessionParams) (database.UserAuthSession, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InsertWoWLogGroup(ctx context.Context, arg database.InsertWoWLogGroupParams) (database.WoWLogGroup, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) Instance(ctx context.Context, id uuid.UUID) (database.LogInstance, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InstanceBySlug(ctx context.Context, hashedSlug pgtype.Text) (database.LogInstance, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InstanceEvent(ctx context.Context, arg database.InstanceEventParams) (database.LogInstanceEvent, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InstancePlayersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstancePlayer, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) InstanceUnitsByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceUnit, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) ListAllUsers(ctx context.Context) ([]database.User, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) ListAllWoWLogGroupsWithOwner(ctx context.Context) ([]database.ListAllWoWLogGroupsWithOwnerRow, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) UpdateUserAuthSessionTokens(ctx context.Context, arg database.UpdateUserAuthSessionTokensParams) (database.UserAuthSession, error) {
	//TODO implement me
	panic("implement me")
}

func (z *interceptor) UpdateUserRoles(ctx context.Context, arg database.UpdateUserRolesParams) (database.User, error) {
	//TODO implement me
	panic("implement me")
}
