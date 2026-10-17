package httpmw

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type instanceIDKey struct{}

func Instance(ctx context.Context) database.LogInstancesGuild {
	id, _ := ctx.Value(instanceIDKey{}).(database.LogInstancesGuild)
	return id
}

type instanceByIDKey struct{}

func InstanceByID(ctx context.Context) bool {
	id, _ := ctx.Value(instanceByIDKey{}).(bool)
	return id
}

func InstanceIDMiddleware(db *authz.Authz) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			instanceIDStr := chi.URLParam(r, "instance_id")
			instanceID, err := uuid.Parse(instanceIDStr)
			var inst database.LogInstancesGuild
			var private bool
			if err != nil {
				row, lookupErr := db.InstanceBySlugWithPrivacy(r.Context(), pgtype.Text{
					String: instanceIDStr,
					Valid:  true,
				})
				if lookupErr != nil {
					httpapi.HandleResponseError(r.Context(), w, lookupErr, httpapi.APIError{
						Response: chroniclesdk.Response{
							Message: "Could not find instance",
						},
						Status:  http.StatusBadRequest,
						Wrapped: nil,
					})
					return
				}
				inst = row.LogInstancesGuild
				private = row.Private
			} else {
				r = r.WithContext(context.WithValue(r.Context(), instanceByIDKey{}, true))
				row, lookupErr := db.InstanceWithPrivacy(r.Context(), instanceID)
				if lookupErr != nil {
					httpapi.HandleResponseError(r.Context(), w, lookupErr, httpapi.APIError{
						Response: chroniclesdk.Response{
							Message: "Could not find instance by id",
						},
						Status:  http.StatusBadRequest,
						Wrapped: nil,
					})
					return
				}
				inst = row.LogInstancesGuild
				private = row.Private
			}

			ctx := context.WithValue(r.Context(), instanceIDKey{}, inst)
			ctx = context.WithValue(ctx, instancePrivateKey{}, private)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

type instancePrivateKey struct{}

func InstancePrivate(ctx context.Context) bool {
	private, _ := ctx.Value(instancePrivateKey{}).(bool)
	return private
}

func InstanceViewMiddleware(db *authz.Authz) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !InstancePrivate(r.Context()) {
				next.ServeHTTP(w, r)
				return
			}

			inst := Instance(r.Context())
			actor, ok := authz.ActorFromContext(r.Context())
			if !ok {
				httpapi.Forbidden(w, nil)
				return
			}
			// Authorize against the parent log directly. A stale instance public
			// wildcard can never grant access after the log becomes private.
			canView, err := db.CheckOne(r.Context(), nil, rel.Relationship{
				ResourceType: "raid_log", ResourceID: inst.LogGroupID.String(), ResourceRelation: "view",
				SubjectType: "user", SubjectID: actor.Object().ID,
			})
			if err != nil {
				httpapi.InternalServerError(w, err)
				return
			}
			if !canView {
				httpapi.Forbidden(w, nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
