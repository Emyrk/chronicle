package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func accountMergeResponse(row database.AccountMergeRequest, blockers []string) chroniclesdk.AccountMergeRequest {
	response := chroniclesdk.AccountMergeRequest{
		ID:              row.ID,
		RequesterUserID: row.RequesterUserID,
		SourceUserID:    row.SourceUserID,
		TargetUserID:    row.TargetUserID,
		DiscordID:       row.DiscordID,
		SourceUsername:  row.SourceUsername,
		SourceEmail:     row.SourceEmail,
		TargetUsername:  row.TargetUsername,
		TargetEmail:     row.TargetEmail,
		SourceBlockers:  blockers,
		Status:          row.Status,
		Message:         row.Message,
		Response:        row.Response,
		CreatedAt:       row.CreatedAt.Time,
	}
	if row.ReviewerID.Valid {
		id := row.ReviewerID.UUID
		response.ReviewerID = &id
	}
	if row.ReviewedAt.Valid {
		reviewedAt := row.ReviewedAt.Time
		response.ReviewedAt = &reviewedAt
	}
	return response
}

func accountMergeDiscordLink(request database.AccountMergeRequest, links []database.UserAuthLink) (database.UserAuthLink, bool) {
	if len(links) != 1 || links[0].Provider != "discord" || links[0].LinkedID != request.DiscordID {
		return database.UserAuthLink{}, false
	}
	return links[0], true
}

func (a *API) accountMergeBlockers(ctx context.Context, request database.AccountMergeRequest) ([]string, error) {
	if request.Status != "pending" {
		return nil, nil
	}
	blockers, err := a.Zed.GetAccountRemovalBlockers(ctx, request.SourceUserID)
	if err != nil {
		return nil, err
	}
	roles, err := a.Zed.UserChronicleRoles(ctx, request.SourceUserID)
	if err != nil {
		return nil, err
	}
	for _, role := range roles {
		if role != "chronicle_member" {
			blockers = append(blockers, "source account role: "+role)
		}
	}
	links, err := a.Zed.ListUserAuthLinks(ctx, request.SourceUserID)
	if err != nil {
		return nil, err
	}
	if _, ok := accountMergeDiscordLink(request, links); !ok {
		blockers = append(blockers, "source account has additional or unexpected sign-in methods")
	}
	return blockers, nil
}

func (a *API) ListMyAccountMergeRequests(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	rows, err := a.Zed.ListMyAccountMergeRequests(r.Context(), claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response := make([]chroniclesdk.AccountMergeRequest, 0, len(rows))
	for _, row := range rows {
		blockers, err := a.accountMergeBlockers(r.Context(), row)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			httpapi.InternalServerError(w, err)
			return
		}
		response = append(response, accountMergeResponse(row, blockers))
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

func (a *API) ListAdminAccountMergeRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := a.Zed.ListAdminAccountMergeRequests(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response := make([]chroniclesdk.AccountMergeRequest, 0, len(rows))
	for _, row := range rows {
		blockers, err := a.accountMergeBlockers(r.Context(), row)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			httpapi.InternalServerError(w, err)
			return
		}
		response = append(response, accountMergeResponse(row, blockers))
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

type accountRemovalBlockedError struct {
	blockers []string
}

func (e *accountRemovalBlockedError) Error() string {
	return "account contains data that cannot be removed automatically"
}

func (a *API) DecideAccountMergeRequest(w http.ResponseWriter, r *http.Request) {
	requestID, err := uuid.Parse(chi.URLParam(r, "requestID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid merge request ID"})
		return
	}
	var req chroniclesdk.AccountMergeDecisionRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if len(req.Response) > 2000 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Response is too long"})
		return
	}
	reviewer := chronauth.MustAuthenticatedClaims(r.Context()).Subject
	var decided database.AccountMergeRequest
	err = a.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		mergeRequest, err := tx.LockPendingAccountMergeRequest(r.Context(), requestID)
		if err != nil {
			return err
		}
		decided = mergeRequest
		status := "rejected"
		if req.Approved {
			locked, err := tx.LockUsersForAccountMerge(r.Context(), []uuid.UUID{mergeRequest.SourceUserID, mergeRequest.TargetUserID})
			if err != nil {
				return err
			}
			if len(locked) != 2 {
				return fmt.Errorf("one of the merge accounts no longer exists")
			}
			blockers, err := tx.GetAccountRemovalBlockers(r.Context(), mergeRequest.SourceUserID)
			if err != nil {
				return err
			}
			roles, err := tx.UserChronicleRoles(r.Context(), mergeRequest.SourceUserID)
			if err != nil {
				return err
			}
			for _, role := range roles {
				if role != "chronicle_member" {
					blockers = append(blockers, "source account role: "+role)
				}
			}
			if len(blockers) > 0 {
				return &accountRemovalBlockedError{blockers: blockers}
			}

			sourceLinks, err := tx.ListUserAuthLinks(r.Context(), mergeRequest.SourceUserID)
			if err != nil {
				return err
			}
			sourceLink, ok := accountMergeDiscordLink(mergeRequest, sourceLinks)
			if !ok {
				return &accountRemovalBlockedError{blockers: []string{"source account has additional or unexpected sign-in methods"}}
			}
			targetLinks, err := tx.ListUserAuthLinks(r.Context(), mergeRequest.TargetUserID)
			if err != nil {
				return err
			}
			for _, link := range targetLinks {
				if link.Provider == "discord" {
					return &accountRemovalBlockedError{blockers: []string{"target account already uses Discord sign-in"}}
				}
			}

			if err := tx.DeleteUserAuthSessionsByUserID(r.Context(), mergeRequest.SourceUserID); err != nil {
				return err
			}
			if err := tx.DeleteUserAuthSessionsByUserID(r.Context(), mergeRequest.TargetUserID); err != nil {
				return err
			}
			if err := tx.MoveUserAuthLink(r.Context(), database.MoveUserAuthLinkParams{
				TargetUserID: mergeRequest.TargetUserID,
				AuthLinkID:   sourceLink.ID,
				SourceUserID: mergeRequest.SourceUserID,
			}); err != nil {
				return err
			}
			if err := tx.DeleteUserRelationships(r.Context(), mergeRequest.SourceUserID); err != nil {
				return err
			}
			deleted, err := tx.DeleteUserAccountRow(r.Context(), mergeRequest.SourceUserID)
			if err != nil {
				return err
			}
			if deleted != 1 {
				return fmt.Errorf("source account was not deleted")
			}
			status = "approved"
		}

		updated, err := tx.DecideAccountMergeRequest(r.Context(), database.DecideAccountMergeRequestParams{
			Status:     status,
			Response:   strings.TrimSpace(req.Response),
			ReviewerID: uuid.NullUUID{UUID: reviewer, Valid: true},
			ID:         requestID,
		})
		if err != nil {
			return err
		}
		if updated != 1 {
			return fmt.Errorf("merge request was already decided")
		}
		decided.Status = status
		return nil
	}, nil)
	var blocked *accountRemovalBlockedError
	if errors.As(err, &blocked) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.AccountDeletionStatus{Blockers: blocked.blockers})
		return
	}
	if errors.Is(err, sql.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Merge request is no longer pending"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	blockers, _ := a.Zed.GetAccountRemovalBlockers(r.Context(), decided.SourceUserID)
	httpapi.Write(r.Context(), w, http.StatusOK, accountMergeResponse(decided, blockers))
}

func (a *API) accountDeletionBlockers(ctx context.Context, userID uuid.UUID) ([]string, error) {
	blockers, err := a.Zed.GetAccountRemovalBlockers(ctx, userID)
	if err != nil {
		return nil, err
	}
	pendingMerge, err := a.Zed.HasPendingAccountMergeRequestForUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if pendingMerge {
		blockers = append(blockers, "pending account merge request")
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
		locked, err := tx.LockUsersForAccountMerge(r.Context(), []uuid.UUID{userID})
		if err != nil {
			return err
		}
		if len(locked) != 1 {
			return sql.ErrNoRows
		}
		pendingMerge, err := tx.HasPendingAccountMergeRequestForUser(r.Context(), userID)
		if err != nil {
			return err
		}
		if pendingMerge {
			return &accountRemovalBlockedError{blockers: []string{"pending account merge request"}}
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
