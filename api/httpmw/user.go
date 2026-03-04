package httpmw

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type userKey struct{}

func User(ctx context.Context) database.User {
	user, _ := ctx.Value(userKey{}).(database.User)
	return user
}

// UserIDMiddleware resolves {userID} route parameter.
// "me" maps to authenticated user. Accessing other users requires admin_users permission.
func UserIDMiddleware(db *authz.Authz) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			claims := chronauth.MustAuthenticatedClaims(ctx)

			rawUserID := chi.URLParam(r, "userID")
			targetUserID := claims.Subject
			if rawUserID != "" && rawUserID != "me" {
				parsed, err := uuid.Parse(rawUserID)
				if err != nil {
					httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid user id"})
					return
				}
				targetUserID = parsed

				if targetUserID != claims.Subject {
					actor, ok := authz.ActorFromContext(ctx)
					if !ok {
						httpapi.Forbidden(w, nil)
						return
					}
					can, err := db.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_users_User(actor))
					if err != nil {
						httpapi.InternalServerError(w, err)
						return
					}
					if !can {
						httpapi.Forbidden(w, nil)
						return
					}
				}
			}

			chronUser, err := db.GetUserByID(ctx, targetUserID)
			if err != nil {
				httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
					Response: chroniclesdk.Response{Message: "Failed to get user", Detail: err.Error()},
					Status:   http.StatusInternalServerError,
					Wrapped:  err,
				})
				return
			}

			user := database.User{
				ID:        chronUser.ID,
				Username:  chronUser.Username,
				Email:     chronUser.Email,
				CreatedAt: chronUser.CreatedAt,
				UpdatedAt: chronUser.UpdatedAt,
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(ctx, userKey{}, user)))
		})
	}
}
