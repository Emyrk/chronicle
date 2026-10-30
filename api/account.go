package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
)

type accountRemovalBlockedError struct {
	blockers []string
}

func (e *accountRemovalBlockedError) Error() string {
	return "account contains data that cannot be removed automatically"
}

func (a *API) accountDeletionBlockers(ctx context.Context, userID uuid.UUID) ([]string, error) {
	blockers, err := a.Zed.GetAccountRemovalBlockers(ctx, userID)
	if err != nil {
		return nil, err
	}
	roles, err := a.Zed.UserChronicleRoles(ctx, userID)
	if err != nil {
		return nil, err
	}
	for _, role := range roles {
		if role != "chronicle_member" {
			blockers = append(blockers, "administrative or entitlement role: "+role)
		}
	}
	return blockers, nil
}

func (a *API) GetAccountDeletionStatus(w http.ResponseWriter, r *http.Request) {
	userID := chronauth.MustAuthenticatedClaims(r.Context()).Subject
	blockers, err := a.accountDeletionBlockers(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.AccountDeletionStatus{
		CanDelete: len(blockers) == 0,
		Blockers:  blockers,
	})
}

func (a *API) DeleteMyAccount(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.DeleteAccountRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Confirmation) != "DELETE" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Type DELETE to confirm account deletion"})
		return
	}
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	currentSession, err := a.Zed.GetCurrentUserAuthSession(r.Context(), database.GetCurrentUserAuthSessionParams{
		SessionID:  claims.SessionID,
		UserID:     claims.Subject,
		UserAuthID: claims.UserAuthID,
		JwtID:      claims.ID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if time.Since(currentSession.CreatedAt.Time) > 15*time.Minute {
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{
			Message: "Sign out and sign back in before deleting your account",
		})
		return
	}
	userID := claims.Subject
	blockers, err := a.accountDeletionBlockers(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if len(blockers) > 0 {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.AccountDeletionStatus{Blockers: blockers})
		return
	}

	err = a.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		locked, err := tx.LockUsersForUpdate(r.Context(), []uuid.UUID{userID})
		if err != nil {
			return err
		}
		if len(locked) != 1 {
			return sql.ErrNoRows
		}
		blockers, err := tx.GetAccountRemovalBlockers(r.Context(), userID)
		if err != nil {
			return err
		}
		roles, err := tx.UserChronicleRoles(r.Context(), userID)
		if err != nil {
			return err
		}
		for _, role := range roles {
			if role != "chronicle_member" {
				blockers = append(blockers, "administrative or entitlement role: "+role)
			}
		}
		if len(blockers) > 0 {
			return &accountRemovalBlockedError{blockers: blockers}
		}
		if err := tx.DeleteUserAuthSessionsByUserID(r.Context(), userID); err != nil {
			return err
		}
		if err := tx.DeleteUserAuthLinksByUserID(r.Context(), userID); err != nil {
			return err
		}
		if err := tx.DeleteUserRelationships(r.Context(), userID); err != nil {
			return err
		}
		deleted, err := tx.DeleteUserAccountRow(r.Context(), userID)
		if err != nil {
			return err
		}
		if deleted != 1 {
			return sql.ErrNoRows
		}
		return nil
	}, nil)
	var blocked *accountRemovalBlockedError
	if errors.As(err, &blocked) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.AccountDeletionStatus{Blockers: blocked.blockers})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	_ = a.Auth.Logout(w, r)
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
