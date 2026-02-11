package authz

import (
	"context"

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

func (z *AuthzTX) Delete(ctx context.Context, filter *rel.PreconditionedFilter) error {
	return z.parent.Delete(ctx, filter)
}

func (z *Authz) CheckOne(ctx context.Context, cs *consistency.Strategy, rs rel.Interface) (bool, error) {
	if cs == nil {
		cs = consistency.MinLatency()
	}
	return z.spice.CheckOne(ctx, cs, rs)
}

func (z *Authz) Check(ctx context.Context, cs *consistency.Strategy, rs ...rel.Interface) ([]bool, error) {
	if cs == nil {
		cs = consistency.MinLatency()
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
	for r, err := range z.spice.ReadRelationships(ctx, consistency.MinLatency(), f) {
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
