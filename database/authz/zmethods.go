package authz

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/consistency"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
)

type Authorizer interface {
	Write(ctx context.Context, txn rel.Txn) (writtenAtRevision string, err error)
	Delete(ctx context.Context, filter *rel.PreconditionedFilter) error
}

type DatabaseAuthorizer interface {
	Authorizer
	database.StoreQueries
}

func (z *Authz) DefaultConsistencyStrategy() *consistency.Strategy {
	if token := z.zedToken.Load(); token != nil {
		return consistency.AtLeast(*token)
	}
	return consistency.Full()
}

func (z *Authz) Write(ctx context.Context, txn rel.Txn) (writtenAtRevision string, err error) {
	token, err := z.spice.Write(ctx, txn)
	if err != nil {
		return "", err
	}

	z.zedToken.Store(&token)
	return token, nil
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
	token, err := z.spice.DeleteAtomic(ctx, filter)
	if err != nil {
		return err
	}
	z.zedToken.Store(&token)
	return nil
}

func (z *AuthzTX) Delete(ctx context.Context, filter *rel.PreconditionedFilter) error {
	return z.parent.Delete(ctx, filter)
}

func (z *Authz) CheckOne(ctx context.Context, cs *consistency.Strategy, rs rel.Interface) (bool, error) {
	if cs == nil {
		cs = z.DefaultConsistencyStrategy()
	}
	return z.spice.CheckOne(ctx, cs, rs)
}

func (z *Authz) Check(ctx context.Context, cs *consistency.Strategy, rs ...rel.Interface) ([]bool, error) {
	if cs == nil {
		cs = z.DefaultConsistencyStrategy()
	}
	return z.spice.Check(ctx, cs, rs...)
}

// UserChronicleRoles returns the relations/roles a user has on the chronicle singleton object.
// These are roles like "admin", "moderator", "upload_capable".
func (z *Authz) UserChronicleRoles(ctx context.Context, user uuid.UUID) ([]string, error) {
	usr := policy.New().User(user)

	// Filter for chronicle:chronicle with any relation
	f := rel.NewFilter("chronicle", "chronicle", "")
	f.WithSubjectFilter(usr.Object().Typ, usr.Object().ID, "")

	var roles []string
	for r, err := range z.spice.ReadRelationships(ctx, z.DefaultConsistencyStrategy(), f) {
		if err != nil {
			return nil, err
		}
		// Check if this relationship's subject is our user
		//if r.SubjectType == usr.Object().ObjectType && r.SubjectID == usr.Object().ObjectId {
		roles = append(roles, r.ResourceRelation)
		//}
	}

	return roles, nil
}
// GuildRosterMember represents a user's roles in a guild from SpiceDB.
type GuildRosterMember struct {
	UserID uuid.UUID
	Roles  []string // "member", "leader", etc.
}

// GuildRosterMembers returns all users with member or leader relations to a guild.
func (z *Authz) GuildRosterMembers(ctx context.Context, guildID uuid.UUID) ([]GuildRosterMember, error) {
	f := rel.NewFilter("guild", guildID.String(), "")
	f.WithSubjectFilter("user", "", "")

	// Collect roles per user
	byUser := make(map[uuid.UUID][]string)
	for r, err := range z.spice.ReadRelationships(ctx, z.DefaultConsistencyStrategy(), f) {
		if err != nil {
			return nil, err
		}
		if r.ResourceRelation != "member" && r.ResourceRelation != "leader" {
			continue
		}
		id, err := uuid.Parse(r.SubjectID)
		if err != nil {
			continue
		}
		byUser[id] = append(byUser[id], r.ResourceRelation)
	}

	members := make([]GuildRosterMember, 0, len(byUser))
	for userID, roles := range byUser {
		members = append(members, GuildRosterMember{
			UserID: userID,
			Roles:  roles,
		})
	}
	return members, nil
}

// AddGuildMember writes the member relation to SpiceDB only.
func (z *Authz) AddGuildMember(ctx context.Context, guildID, userID uuid.UUID) error {
	b := policy.New()
	g := b.Guild(guildID)
	g.Chronicle(b.GlobalChronicle())
	g.Member(b.User(userID))
	_, err := z.Write(ctx, *b.Txn())
	return err
}

// RemoveGuildMember deletes all guild relations for a user from SpiceDB.
func (z *Authz) RemoveGuildMember(ctx context.Context, guildID, userID uuid.UUID) error {
	g := policy.New().Guild(guildID).Object()
	u := policy.New().User(userID).Object()
	f := rel.NewFilter(g.Typ, g.ID, "")
	f.WithSubjectFilter(u.Typ, u.ID, "")
	return z.Delete(ctx, rel.NewPreconditionedFilter(f))
}

// SetGuildMemberRole replaces all guild relations for a user with the given role.
// Valid roles: "member", "leader".
func (z *Authz) SetGuildMemberRole(ctx context.Context, guildID, userID uuid.UUID, role string) error {
	// First remove all existing relations for this user in the guild
	if err := z.RemoveGuildMember(ctx, guildID, userID); err != nil {
		return err
	}

	// Then add the new role
	b := policy.New()
	g := b.Guild(guildID)
	g.Chronicle(b.GlobalChronicle())
	u := b.User(userID)
	switch role {
	case "leader":
		g.Leader(u)
	case "member":
		g.Member(u)
	default:
		return fmt.Errorf("invalid role: %s", role)
	}
	_, err := z.Write(ctx, *b.Txn())
	return err
}

// IsGuildMember checks if a user has any relation (member/leader) to a guild.
func (z *Authz) IsGuildMember(ctx context.Context, guildID, userID uuid.UUID) (bool, error) {
	zg := policy.New().Guild(guildID)
	actor := policy.New().User(userID)
	return z.CheckOne(ctx, nil, zg.CanView_chronicle_roster_User(actor))
}

