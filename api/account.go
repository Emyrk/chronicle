package api

import (
	"database/sql"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// accountPurgeRecentSignIn is how recently the user must have signed in to
// start a purge.
const accountPurgeRecentSignIn = 15 * time.Minute

func accountPurgeStatus(row database.AccountPurge) chroniclesdk.AccountPurgeStatus {
	return chroniclesdk.AccountPurgeStatus{
		ID:          row.ID,
		Status:      row.Status,
		Step:        row.Step,
		LogsTotal:   row.LogsTotal,
		LogsDeleted: row.LogsDeleted,
		Error:       row.Error,
	}
}

func isNoRows(err error) bool {
	return errors.Is(err, sql.ErrNoRows) || errors.Is(err, pgx.ErrNoRows)
}

func (a *API) GetAccountPurgeInventory(w http.ResponseWriter, r *http.Request) {
	userID := chronauth.MustAuthenticatedClaims(r.Context()).Subject
	counts, err := a.Zed.GetAccountDataCounts(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	blockers, err := a.Zed.GetAccountDeletionBlockers(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	inventory := chroniclesdk.AccountPurgeInventory{
		Data:     make([]chroniclesdk.AccountDataCount, 0, len(counts)),
		Blockers: blockers,
	}
	for _, count := range counts {
		inventory.Data = append(inventory.Data, chroniclesdk.AccountDataCount{
			GroupKey: count.GroupKey, Label: count.Label, Count: count.Count,
		})
	}
	active, err := a.Zed.GetActiveAccountPurgeByUser(r.Context(), userID)
	if err == nil {
		status := accountPurgeStatus(active)
		inventory.ActivePurge = &status
	} else if !isNoRows(err) {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, inventory)
}

func (a *API) StartAccountPurge(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.StartAccountPurgeRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Confirmation) != chroniclesdk.AccountPurgeConfirmation {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Type " + chroniclesdk.AccountPurgeConfirmation + " to confirm",
		})
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
	if time.Since(currentSession.CreatedAt.Time) > accountPurgeRecentSignIn {
		httpapi.Write(r.Context(), w, http.StatusForbidden, chroniclesdk.Response{
			Message: "Sign out and sign back in before purging your account",
		})
		return
	}

	userID := claims.Subject
	var purge database.AccountPurge
	err = a.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		// Uploads and module creation lock the same row, so nothing new can
		// be created between this check and the purge row becoming visible.
		if _, err := tx.LockUsersForUpdate(r.Context(), []uuid.UUID{userID}); err != nil {
			return err
		}
		if _, err := tx.GetActiveAccountPurgeByUser(r.Context(), userID); err == nil {
			return httpapi.NewAPIError(errors.New("purge already running"), "Your account is already being purged", http.StatusConflict)
		} else if !isNoRows(err) {
			return err
		}
		blockers, err := tx.GetAccountDeletionBlockers(r.Context(), userID)
		if err != nil {
			return err
		}
		if len(blockers) > 0 {
			return httpapi.NewAPIError(errors.New("purge blocked"), "Resolve these before purging your account: "+strings.Join(blockers, ", "), http.StatusConflict)
		}
		counts, err := tx.GetAccountDataCounts(r.Context(), userID)
		if err != nil {
			return err
		}
		for _, count := range counts {
			if !slices.Contains(req.AcknowledgedGroups, count.GroupKey) {
				return httpapi.NewAPIError(errors.New("unacknowledged data"), "Your data changed since you reviewed it. Review it again and confirm every item.", http.StatusConflict)
			}
		}
		purge, err = tx.InsertAccountPurge(r.Context(), database.InsertAccountPurgeParams{
			ID: uuid.New(), UserID: userID,
		})
		return err
	}, nil)
	if apiErr, ok := httpapi.IsAPIError(err); ok {
		httpapi.Write(r.Context(), w, apiErr.Status, apiErr.Response)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	if err := a.Chronicle.EnqueueAccountPurge(r.Context(), purge.ID); err != nil {
		_ = a.Zed.FinishAccountPurge(r.Context(), database.FinishAccountPurgeParams{
			ID: purge.ID, Status: chronicle.AccountPurgeFailed, Error: "The purge could not be started. Please try again.",
		})
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusAccepted, accountPurgeStatus(purge))
}

func (a *API) GetAccountPurgeStatus(w http.ResponseWriter, r *http.Request) {
	purgeID, err := uuid.Parse(chi.URLParam(r, "purgeID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Purge not found"})
		return
	}
	purge, err := a.Zed.GetAccountPurge(r.Context(), purgeID)
	if isNoRows(err) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Purge not found"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, accountPurgeStatus(purge))
}
