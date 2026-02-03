package spice

import (
	"context"
	"errors"
	"log/slog"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/spice/debug"
	"github.com/Emyrk/chronicle/database/spice/policy"
	"github.com/Emyrk/chronicle/database/spice/policy/playground/relationships"
	"github.com/authzed/authzed-go/pkg/requestmeta"
	"github.com/authzed/authzed-go/pkg/responsemeta"
	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
	"github.com/authzed/authzed-go/v1"
	"github.com/authzed/grpcutil"
	"github.com/authzed/spicedb/pkg/tuple"
	"golang.org/x/xerrors"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/encoding/protojson"
	"tailscale.com/syncs"
)

var _ database.Store = (*Spice)(nil)

type Spice struct {
	client *authzed.Client
	logger *slog.Logger
	debug  bool

	// reverts is only used if in a transaction.
	reverts reverter

	db database.Store

	// zedToken is required to enforce consistency. When making a request, passing
	// this token says "I want to see the world as if it was at least after this time".
	// For a 100% consistent view, we should update this on any write.
	// In a world of HA, we have an issue that a different Coder might have done
	// a write.
	// TODO: A way of doing this across HA is storing the Zedtoken in the DB on
	//		each resource. So if you fetch a workspace, it has the Zedtoken required
	//		to get it's updated state.
	zedToken syncs.AtomicValue[*v1.ZedToken]
}

type Options struct {
	GRPCURL string
	Logger  *slog.Logger
	Store   database.Store
	Debug   bool
}

func New(ctx context.Context, opts *Options) (*Spice, error) {
	if opts.Store == nil {
		return nil, xerrors.Errorf("store is required")
	}
	cli, err := authzed.NewClient(
		opts.GRPCURL,
		grpcutil.WithInsecureBearerToken("chronicle-dev-key"),
		//grpcutil.WithBearerToken("chronicle-dev-key"),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, err
	}

	_, err = cli.WriteSchema(ctx, &v1.WriteSchemaRequest{
		Schema: policy.Schema,
	})
	if err != nil {
		return nil, err
	}

	return &Spice{
		client: cli,
		logger: opts.Logger,
		db:     opts.Store,
		debug:  opts.Debug,
	}, nil
}

func (s *Spice) Debugging(set bool) {
	s.debug = set
}

type debugCtxKey struct{}

func (s *Spice) debugging(ctx context.Context) bool {
	if s.debug {
		// It is on globally
		return true
	}
	if v, ok := ctx.Value(debugCtxKey{}).(bool); ok {
		return v
	}
	return false
}

func WithDebugging(ctx context.Context) context.Context {
	return context.WithValue(ctx, debugCtxKey{}, true)
}

func (s *Spice) Close() error {
	return errors.Join(s.client.Close(), s.db.Close())
}

// WithRelationsExec allows exec functions that do not return a return object.
func WithRelationsExec[A any](ctx context.Context, s *Spice, relations []v1.Relationship, do func(ctx context.Context, arg A) error, arg A) error {
	_, err := WithRelations(ctx, s, relations, func(ctx context.Context, arg A) (interface{}, error) {
		return nil, do(ctx, arg)
	}, arg)
	return err
}

func WithRelations[A any, R any](ctx context.Context, s *Spice, relations []v1.Relationship, do func(ctx context.Context, arg A) (R, error), arg A) (R, error) {
	var empty R
	revert, err := s.WriteRelationships(ctx, relations...)
	if err != nil {
		return empty, xerrors.Errorf("write relationships: %w", err)
	}
	r, err := do(ctx, arg)
	if err != nil {
		revert()
		return r, err
	}
	return r, nil
}

func (s *Spice) WithRelations(ctx context.Context, relations []v1.Relationship, do func() error) (context.Context, error) {
	revert, err := s.WriteRelationships(ctx, relations...)
	if err != nil {
		return nil, xerrors.Errorf("write relationships: %w", err)
	}

	ctx = context.WithValue(ctx, "revert", revert)
	return ctx, nil
}

// WriteRelationships returns a revert function that will delete all the relationships that
// were written.
func (s *Spice) WriteRelationships(ctx context.Context, rels ...v1.Relationship) (revert func(), _ error) {
	opts := []grpc.CallOption{}
	if s.debugging(ctx) {
		wlogger := s.logger.With(slog.Any("write_relationships", relationships.RelationshipsToStrings(rels)))
		debugCtx, opt, callback := debugSpiceDBRPC(ctx, wlogger)
		opts = append(opts, opt)
		defer callback()
		ctx = debugCtx
	}

	updates := make([]*v1.RelationshipUpdate, 0, len(rels))
	for i := range rels {
		// Make a copy so to ensure the delete function has the correct data.
		// We could definitely improve the memory allocations here.
		cpy := rels[i]
		updates = append(updates, &v1.RelationshipUpdate{
			Operation:    v1.RelationshipUpdate_OPERATION_TOUCH,
			Relationship: &cpy,
		})
	}

	// A relationship can be written like this:
	//	group:hr#member@user:camilla
	// And parsed with:
	// 	tup := tuple.Parse(rel)
	// 	v1Rel := tuple.ToRelationship(tup)
	resp, err := s.client.WriteRelationships(ctx, &v1.WriteRelationshipsRequest{
		Updates:               updates,
		OptionalPreconditions: nil,
	}, opts...)
	if err != nil {
		return nil, xerrors.Errorf("write relationship: %w", err)
	}
	// TODO: We should probably return this? Allow it to be stored on the object or something?
	s.zedToken.Store(resp.WrittenAt)

	// revert is an optional callback the caller can use to delete the relationship
	// if it's no longer needed. This is helpful if their tx fails.
	revert = func() {
		for i := range updates {
			updates[i].Operation = v1.RelationshipUpdate_OPERATION_DELETE
		}

		// The delete api might be quicker, but this an atomic operation.
		resp, err := s.client.WriteRelationships(ctx, &v1.WriteRelationshipsRequest{
			Updates:               updates,
			OptionalPreconditions: nil,
		}, opts...)
		if resp != nil && resp.WrittenAt != nil {
			s.zedToken.Store(resp.WrittenAt)
		}
		if err != nil {
			// Log out all the relationships that might have failed.
			rels := make([]string, 0, len(updates))
			for _, up := range updates {
				str, _ := tuple.V1StringRelationship(up.Relationship)
				rels = append(rels, str)
			}
			s.logger.Error("revert relationships",
				slog.String("error", err.Error()),
				slog.Int("quantity", len(updates)),
				slog.Any("relationships", rels),
			)
		}
	}

	// If we are in a tx, handle all reverts as a single batch.
	// This will make sure any single failure triggers every revert
	// in the same tx.
	if s.reverts != nil {
		s.reverts.AddRevert(revert)
		revert = noop
	}
	return revert, nil
}

func (s *Spice) Check(ctx context.Context, permission string, resource *v1.ObjectReference) error {
	actor, ok := ActorFromContext(ctx)
	if !ok {
		return NoActorError
	}

	if actor.Object.ObjectType == god && actor.Object.ObjectId == "god" {
		return nil
	}

	opts := []grpc.CallOption{}
	if s.debugging(ctx) {
		debugCtx, opt, callback := debugSpiceDBRPC(ctx, s.logger)
		opts = append(opts, opt)
		defer callback()
		ctx = debugCtx
	}

	// A permission can be written like:
	//	"<object_type:object_id>#<permission>@<subject_type:subject_id>"
	//	"workspace:dogfood#view@user:root"
	// And parsed with:
	//	tup := tuple.Parse(perm)
	//	r := tuple.ToRelationship(tup)
	resp, err := s.client.CheckPermission(ctx, &v1.CheckPermissionRequest{
		Consistency: &v1.Consistency{Requirement: &v1.Consistency_AtLeastAsFresh{s.zedToken.Load()}},
		Resource:    resource,
		Permission:  permission,
		Subject:     actor,
		// Context for caveats
		Context: nil,
	}, opts...)
	if err != nil {
		return xerrors.Errorf("check permission: %w", err)
	}

	if resp.Permissionship == v1.CheckPermissionResponse_PERMISSIONSHIP_HAS_PERMISSION {
		return nil
	}
	if resp.Permissionship == v1.CheckPermissionResponse_PERMISSIONSHIP_CONDITIONAL_PERMISSION {
		return xerrors.Errorf("not authorized: conditional permission")
	}
	return xerrors.Errorf("not authorized")
}

//func (s *SpiceDB) Lookup(ctx context.Context, permission string, resource *v1.ObjectReference) ([]uuid.UUID, error) {

//}

func debugSpiceDBRPC(ctx context.Context, logger *slog.Logger) (debugCtx context.Context, opt grpc.CallOption, debugString func()) {
	var trailerMD metadata.MD
	ctx = requestmeta.AddRequestHeaders(ctx, requestmeta.RequestDebugInformation)
	debugString = func() {
		if trailerMD.Len() == 0 {
			return
		}

		fields := []any{} // The only way to make the compiler happy
		if count, err := responsemeta.GetIntResponseTrailerMetadata(trailerMD, responsemeta.CachedOperationsCount); err == nil {
			// The number of cached operations hit.
			fields = append(fields, slog.Int("cached_operations_count", count))
		}
		if count, err := responsemeta.GetIntResponseTrailerMetadata(trailerMD, responsemeta.DispatchedOperationsCount); err == nil {
			// The number of dispatched operations
			fields = append(fields, slog.Int("dispatched_operations_count", count))
		}

		msg := "debug rpc"
		// This debug information key should be present for PermissionChecks. It
		// is not present in all responses (like write responses)
		found, err := responsemeta.GetResponseTrailerMetadata(trailerMD, responsemeta.DebugInformation)
		if err == nil {
			debugInfo := &v1.DebugInformation{}
			err = protojson.Unmarshal([]byte(found), debugInfo)
			if err != nil {
				logger.Debug("debug rpc failed: unable to debug proto", slog.String("error", err.Error()))
				return
			}

			if debugInfo.Check == nil {
				logger.Debug("debug rpc: no trace found for the check")
				return
			}
			tp := debug.NewTreePrinter()
			debug.DisplayCheckTrace(debugInfo.Check, tp, false)
			msg = tp.String()
		}

		logger.Debug(msg, fields...)
	}

	return ctx, grpc.Trailer(&trailerMD), debugString
}

type NoopAuthorization struct{}

func (NoopAuthorization) Check(ctx context.Context, permission string, resource *v1.ObjectReference) error {
	return nil
}

func noop() {}
