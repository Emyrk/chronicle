package authz

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
)

type interceptor struct {
	Authorizer
	database.Store
}

func (z *interceptor) DeleteAllParsedLogsByGroupID(ctx context.Context, id uuid.UUID) error {
	return z.Store.DeleteAllParsedLogsByGroupID(ctx, id)
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

func (z *interceptor) DeleteLogInstanceByIDAndGroup(ctx context.Context, arg database.DeleteLogInstanceByIDAndGroupParams) (uuid.UUID, error) {
	b := policy.New().Instance(arg.ID).Object()
	f := rel.NewFilter(b.Typ, b.ID, "")
	err := z.Delete(ctx, rel.NewPreconditionedFilter(f))
	if err != nil {
		return uuid.Nil, fmt.Errorf("delete authz relations: %w", err)
	}
	return z.Store.DeleteLogInstanceByIDAndGroup(ctx, arg)
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

func (z *interceptor) CreateUserPanelLayout(ctx context.Context, arg database.CreateUserPanelLayoutParams) (database.UserPanelLayout, error) {
	if arg.ID == uuid.Nil {
		arg.ID = uuid.New()
	}

	if !arg.UserID.Valid {
		return database.UserPanelLayout{}, fmt.Errorf("create layout missing user id")
	}

	b := policy.New()
	b.Layout(arg.ID).
		Owner(b.User(arg.UserID.UUID)).
		Chronicle(b.GlobalChronicle())

	_, err := z.Write(ctx, *b.Txn())
	if err != nil {
		return database.UserPanelLayout{}, err
	}

	return z.Store.CreateUserPanelLayout(ctx, arg)
}

func (z *interceptor) DeleteUserPanelLayoutByID(ctx context.Context, id uuid.UUID) (int64, error) {
	obj := policy.New().Layout(id).Object()
	f := rel.NewFilter(obj.Typ, obj.ID, "")
	err := z.Delete(ctx, rel.NewPreconditionedFilter(f))
	if err != nil {
		return 0, fmt.Errorf("delete authz relations: %w", err)
	}
	return z.Store.DeleteUserPanelLayoutByID(ctx, id)
}

func (z *interceptor) DeleteGuildMember(ctx context.Context, arg database.DeleteGuildMemberParams) error {
	// Delete all authz relations for the user in the guild, then delete the guild member
	g := policy.New().Guild(arg.GuildID).Object()
	u := policy.New().User(arg.UserID).Object()
	f := rel.NewFilter(g.Typ, g.ID, "")
	f.WithSubjectFilter(u.Typ, u.ID, "")
	err := z.Delete(ctx, rel.NewPreconditionedFilter(f))
	if err != nil {
		return fmt.Errorf("delete authz relations: %w", err)
	}
	return z.Store.DeleteGuildMember(ctx, arg)
}

func (z *interceptor) InsertGuildMember(ctx context.Context, arg database.InsertGuildMemberParams) (database.GuildMember, error) {
	b := policy.New()
	g := b.Guild(arg.GuildID)
	g.Chronicle(b.GlobalChronicle())
	g.Member(b.User(arg.UserID))

	_, err := z.Write(ctx, *b.Txn())
	if err != nil {
		return database.GuildMember{}, err
	}
	return z.Store.InsertGuildMember(ctx, arg)
}

func (z *interceptor) UpsertGuild(ctx context.Context, arg database.UpsertGuildParams) (database.Guild, error) {
	g, err := z.Store.UpsertGuild(ctx, arg)
	if err != nil {
		return database.Guild{}, err
	}

	b := policy.New()
	b.Guild(g.ID).Chronicle(b.GlobalChronicle())

	_, err = z.Write(ctx, *b.Txn())
	if err != nil {
		return database.Guild{}, err
	}
	return g, nil
}
