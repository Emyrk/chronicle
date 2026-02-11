package authz

import (
	"context"

	"github.com/Emyrk/chronicle/database"
	"github.com/authzed/gochugaru/consistency"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type Authorizer interface {
	Write(ctx context.Context, txn rel.Txn) (writtenAtRevision string, err error)
	Delete(ctx context.Context, filter *rel.PreconditionedFilter) error
}

type DatabaseAuthorizer interface {
	Authorizer
	database.StoreQueries
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

func (z *Authz) Delete(ctx context.Context, filter *rel.PreconditionedFilter) error {
	return z.spice.Delete(ctx, filter)
}

func (z *Authz) Check(ctx context.Context, cs *consistency.Strategy, rs ...rel.Interface) ([]bool, error) {
	if cs == nil {
		cs = consistency.MinLatency()
	}
	return z.spice.Check(ctx, cs, rs...)
}

type interceptor struct {
	Authorizer
	store database.Store
}

func (z *interceptor) DeleteAllParsedLogsByGroupID(ctx context.Context, id uuid.UUID) error {
	return z.store.DeleteAllParsedLogsByGroupID(ctx, id)
}

func (z *interceptor) DeleteThisQuery(ctx context.Context) error {
	return z.store.DeleteThisQuery(ctx)
}

func (z *interceptor) DeleteWoWLogGroup(ctx context.Context, id uuid.UUID) error {
	return z.store.DeleteWoWLogGroup(ctx, id)
}

func (z *interceptor) EncountersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceEncounter, error) {
	return z.store.EncountersByInstanceID(ctx, instanceID)
}

func (z *interceptor) GetInstanceEncounterCharacterFights(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceEncounterHostile, error) {
	return z.store.GetInstanceEncounterCharacterFights(ctx, instanceID)
}

func (z *interceptor) GetInstanceYoutubeData(ctx context.Context, logInstanceID uuid.UUID) (database.LogInstanceYoutubeTimestamped, error) {
	return z.store.GetInstanceYoutubeData(ctx, logInstanceID)
}

func (z *interceptor) GetUserAuthByLinkedID(ctx context.Context, arg database.GetUserAuthByLinkedIDParams) (database.UserAuthLink, error) {
	return z.store.GetUserAuthByLinkedID(ctx, arg)
}

func (z *interceptor) GetUserAuthLinkByUserID(ctx context.Context, userID uuid.UUID) (database.UserAuthLink, error) {
	return z.store.GetUserAuthLinkByUserID(ctx, userID)
}

func (z *interceptor) GetUserAuthSessionByID(ctx context.Context, id uuid.UUID) (database.UserAuthSession, error) {
	return z.store.GetUserAuthSessionByID(ctx, id)
}

func (z *interceptor) GetUserByID(ctx context.Context, id uuid.UUID) (database.User, error) {
	return z.store.GetUserByID(ctx, id)
}

func (z *interceptor) GetWoWLogFilesByGroupID(ctx context.Context, wowLogID uuid.UUID) ([]database.LogFile, error) {
	return z.store.GetWoWLogFilesByGroupID(ctx, wowLogID)
}

func (z *interceptor) GetWoWLogGroupByID(ctx context.Context, id uuid.UUID) (database.GetWoWLogGroupByIDRow, error) {
	return z.store.GetWoWLogGroupByID(ctx, id)
}

func (z *interceptor) GetWoWLogGroupsByOwner(ctx context.Context, owner uuid.UUID) ([]database.GetWoWLogGroupsByOwnerRow, error) {
	return z.store.GetWoWLogGroupsByOwner(ctx, owner)
}

func (z *interceptor) InsertEncounter(ctx context.Context, arg database.InsertEncounterParams) (database.LogInstanceEncounter, error) {
	return z.store.InsertEncounter(ctx, arg)
}

func (z *interceptor) InsertEncounterCharacterFights(ctx context.Context, arg []database.InsertEncounterCharacterFightsParams) *database.InsertEncounterCharacterFightsBatchResults {
	return z.store.InsertEncounterCharacterFights(ctx, arg)
}

func (z *interceptor) InsertInstance(ctx context.Context, arg database.InsertInstanceParams) (database.LogInstance, error) {
	return z.store.InsertInstance(ctx, arg)
}

func (z *interceptor) InsertInstancePlayers(ctx context.Context, arg []database.InsertInstancePlayersParams) *database.InsertInstancePlayersBatchResults {
	return z.store.InsertInstancePlayers(ctx, arg)
}

func (z *interceptor) InsertInstanceUnits(ctx context.Context, arg []database.InsertInstanceUnitsParams) *database.InsertInstanceUnitsBatchResults {
	return z.store.InsertInstanceUnits(ctx, arg)
}

func (z *interceptor) InsertLogFile(ctx context.Context, arg database.InsertLogFileParams) (database.LogFile, error) {
	return z.store.InsertLogFile(ctx, arg)
}

func (z *interceptor) InsertLogInstanceEvents(ctx context.Context, arg []database.InsertLogInstanceEventsParams) *database.InsertLogInstanceEventsBatchResults {
	return z.store.InsertLogInstanceEvents(ctx, arg)
}

func (z *interceptor) InsertParsedLogGroup(ctx context.Context, id uuid.UUID) error {
	return z.store.InsertParsedLogGroup(ctx, id)
}

func (z *interceptor) InsertStampedYoutubeVideo(ctx context.Context, arg database.InsertStampedYoutubeVideoParams) error {
	return z.store.InsertStampedYoutubeVideo(ctx, arg)
}

func (z *interceptor) InsertUser(ctx context.Context, arg database.InsertUserParams) (database.User, error) {
	return z.store.InsertUser(ctx, arg)
}

func (z *interceptor) InsertUserAuth(ctx context.Context, arg database.InsertUserAuthParams) (database.UserAuthLink, error) {
	return z.store.InsertUserAuth(ctx, arg)
}

func (z *interceptor) InsertUserAuthSession(ctx context.Context, arg database.InsertUserAuthSessionParams) (database.UserAuthSession, error) {
	return z.store.InsertUserAuthSession(ctx, arg)
}

func (z *interceptor) InsertWoWLogGroup(ctx context.Context, arg database.InsertWoWLogGroupParams) (database.WoWLogGroup, error) {
	return z.store.InsertWoWLogGroup(ctx, arg)
}

func (z *interceptor) Instance(ctx context.Context, id uuid.UUID) (database.LogInstance, error) {
	return z.store.Instance(ctx, id)
}

func (z *interceptor) InstanceBySlug(ctx context.Context, hashedSlug pgtype.Text) (database.LogInstance, error) {
	return z.store.InstanceBySlug(ctx, hashedSlug)
}

func (z *interceptor) InstanceEvent(ctx context.Context, arg database.InstanceEventParams) (database.LogInstanceEvent, error) {
	return z.store.InstanceEvent(ctx, arg)
}

func (z *interceptor) InstancePlayersByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstancePlayer, error) {
	return z.store.InstancePlayersByInstanceID(ctx, instanceID)
}

func (z *interceptor) InstanceUnitsByInstanceID(ctx context.Context, instanceID uuid.UUID) ([]database.LogInstanceUnit, error) {
	return z.store.InstanceUnitsByInstanceID(ctx, instanceID)
}

func (z *interceptor) ListAllUsers(ctx context.Context) ([]database.User, error) {
	return z.store.ListAllUsers(ctx)
}

func (z *interceptor) ListAllWoWLogGroupsWithOwner(ctx context.Context) ([]database.ListAllWoWLogGroupsWithOwnerRow, error) {
	return z.store.ListAllWoWLogGroupsWithOwner(ctx)
}

func (z *interceptor) UpdateUserAuthSessionTokens(ctx context.Context, arg database.UpdateUserAuthSessionTokensParams) (database.UserAuthSession, error) {
	return z.store.UpdateUserAuthSessionTokens(ctx, arg)
}

func (z *interceptor) UpdateUserRoles(ctx context.Context, arg database.UpdateUserRolesParams) (database.User, error) {
	return z.store.UpdateUserRoles(ctx, arg)
}
