package httpmw

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
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
			var unlisted bool
			if err != nil {
				row, lookupErr := db.InstanceBySlugWithUnlisted(r.Context(), pgtype.Text{
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
				unlisted = row.Unlisted
			} else {
				r = r.WithContext(context.WithValue(r.Context(), instanceByIDKey{}, true))
				row, lookupErr := db.InstanceWithUnlisted(r.Context(), instanceID)
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
				unlisted = row.Unlisted
			}

			ctx := context.WithValue(r.Context(), instanceIDKey{}, inst)
			ctx = context.WithValue(ctx, instanceUnlistedKey{}, unlisted)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

type instanceUnlistedKey struct{}

func InstanceUnlisted(ctx context.Context) bool {
	unlisted, _ := ctx.Value(instanceUnlistedKey{}).(bool)
	return unlisted
}
