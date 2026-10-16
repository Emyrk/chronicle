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
			if err != nil {
				inst, err = db.InstanceBySlug(r.Context(), pgtype.Text{
					String: instanceIDStr,
					Valid:  true,
				})
				if err != nil {
					httpapi.HandleResponseError(r.Context(), w, err, httpapi.APIError{
						Response: chroniclesdk.Response{
							Message: "Could not find instance",
						},
						Status:  http.StatusBadRequest,
						Wrapped: nil,
					})
					return
				}
			} else {
				r = r.WithContext(context.WithValue(r.Context(), instanceByIDKey{}, true))
				inst, err = db.Instance(r.Context(), instanceID)
				if err != nil {
					httpapi.HandleResponseError(r.Context(), w, err, httpapi.APIError{
						Response: chroniclesdk.Response{
							Message: "Could not find instance by id",
						},
						Status:  http.StatusBadRequest,
						Wrapped: nil,
					})
					return
				}
			}

			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), instanceIDKey{}, inst)))
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
			inst := Instance(r.Context())
			private, err := db.GetWoWLogGroupPrivacy(r.Context(), inst.LogGroupID)
			if err != nil {
				httpapi.InternalServerError(w, err)
				return
			}
			r = r.WithContext(context.WithValue(r.Context(), instancePrivateKey{}, private))
			if !private {
				next.ServeHTTP(w, r)
				return
			}

			actor, ok := authz.ActorFromContext(r.Context())
			if !ok {
				httpapi.Forbidden(w, nil)
				return
			}
			canView, err := db.CheckOne(r.Context(), nil, rel.Relationship{
				ResourceType: "instance", ResourceID: inst.ID.String(), ResourceRelation: "view",
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
