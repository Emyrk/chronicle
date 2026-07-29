package linkedapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/zugzuglink"
)

// externalSyncCooldown is the minimum time between external verification
// syncs per user per provider.
const externalSyncCooldown = 5 * time.Minute

// SyncExternal links the authenticated user's characters using the tenant's
// external verification provider. The provider verifies players via Discord,
// so the user must have a Discord identity on their account.
func (h *Handler) SyncExternal(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := chronauth.AuthenticationState(r)
	userID := state.Claims.Subject

	config := h.externalVerification
	if config == nil || config.Type != zugzuglink.Type {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "External verification is not enabled for this site",
		})
		return
	}
	client := zugzuglink.New(config.URL, config.Secret)
	source := client.Source()

	// The provider identifies players by Discord ID.
	authLink, err := h.zed.GetUserAuthLinkByUserIDAndProvider(ctx, database.GetUserAuthLinkByUserIDAndProviderParams{
		UserID:   userID,
		Provider: "discord",
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Your account is not connected to Discord"},
			Status:   http.StatusForbidden,
		})
		return
	}

	// Rate limit: once per cooldown per user per provider. The timestamp is
	// recorded before the outbound request so failures also count, keeping a
	// broken provider from being hammered.
	sync, err := h.zed.GetExternalCharacterLinkSync(ctx, database.GetExternalCharacterLinkSyncParams{
		UserID: userID,
		Source: source,
	})
	if err == nil && time.Since(sync.LastSyncedAt.Time) < externalSyncCooldown {
		retryIn := externalSyncCooldown - time.Since(sync.LastSyncedAt.Time)
		w.Header().Set("Retry-After", retryIn.Round(time.Second).String())
		httpapi.Write(ctx, w, http.StatusTooManyRequests, chroniclesdk.Response{
			Message: "Please wait a few minutes before syncing again",
		})
		return
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}
	if err := h.zed.UpsertExternalCharacterLinkSync(ctx, database.UpsertExternalCharacterLinkSyncParams{
		UserID: userID,
		Source: source,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	verification, err := client.FetchByDiscordID(ctx, authLink.LinkedID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadGateway, chroniclesdk.Response{
			Message: "The verification provider could not be reached, try again later",
			Detail:  err.Error(),
		})
		return
	}

	if !verification.Verified {
		resp := chroniclesdk.ExternalSyncResponse{
			SyncedAt:  time.Now(),
			Verified:  false,
			Linked:    []chroniclesdk.LinkedCharacter{},
			Conflicts: []string{},
			Unmatched: []string{},
		}
		h.storeSyncResponse(ctx, userID, source, resp)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	resp := chroniclesdk.ExternalSyncResponse{
		SyncedAt:  time.Now(),
		Verified:  true,
		Linked:    []chroniclesdk.LinkedCharacter{},
		Conflicts: []string{},
		Unmatched: []string{},
	}

	// Replace this source's links atomically: the delete and re-inserts
	// happen in one transaction, so a failure part-way never leaves the
	// user with half their characters unlinked.
	err = h.zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		// Preserve the primary flag across the delete/re-add cycle.
		deleted, err := tx.DeleteUserCharacterLinksByUserAndSource(ctx, database.DeleteUserCharacterLinksByUserAndSourceParams{
			UserID:     userID,
			LinkSource: source,
		})
		if err != nil {
			return err
		}
		previousPrimary := map[string]bool{}
		for _, link := range deleted {
			if link.IsPrimary {
				previousPrimary[link.CharacterGuid.String()] = true
			}
		}

		// Resolve each character's realm from the provider's realmKey,
		// caching lookups since most characters share a realm.
		realms := map[string]uuid.UUID{}
		for _, character := range verification.Characters {
			realmID, ok := realms[character.RealmKey]
			if !ok {
				realm, err := tx.GetWoWServerRealmByName(ctx, character.RealmName())
				if errors.Is(err, sql.ErrNoRows) {
					resp.Unmatched = append(resp.Unmatched, character.Name)
					continue
				}
				if err != nil {
					return err
				}
				realmID = realm.ID
				realms[character.RealmKey] = realmID
			}

			// Match by name on the character's realm. Names are the only
			// identity the provider gives us; game_players is keyed by GUID.
			player, err := tx.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{
				RealmID: realmID,
				Name:    character.Name,
			})
			if errors.Is(err, sql.ErrNoRows) {
				resp.Unmatched = append(resp.Unmatched, character.Name)
				continue
			}
			if err != nil {
				return err
			}

			// Check for an existing link up front: a unique-violation error
			// would abort the whole transaction.
			existing, err := tx.GetUserCharacterLink(ctx, database.GetUserCharacterLinkParams{
				CharacterGuid: player.ID,
				RealmID:       realmID,
			})
			if err == nil {
				if existing.UserID == userID {
					// Already linked to this user (e.g. manually) — fine.
					continue
				}
				resp.Conflicts = append(resp.Conflicts, character.Name)
				continue
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}

			if _, err := tx.InsertUserCharacterLink(ctx, database.InsertUserCharacterLinkParams{
				UserID:        userID,
				CharacterGuid: player.ID,
				RealmID:       realmID,
				LinkedBy:      uuid.NullUUID{UUID: userID, Valid: true},
				LinkSource:    source,
			}); err != nil {
				return err
			}

			if previousPrimary[player.ID.String()] {
				if _, err := tx.SetPrimaryUserCharacter(ctx, database.SetPrimaryUserCharacterParams{
					UserID:        userID,
					CharacterGuid: player.ID,
					RealmID:       realmID,
				}); err != nil && !errors.Is(err, sql.ErrNoRows) {
					return err
				}
			}
		}

		// Return the fresh links joined with player data.
		rows, err := tx.GetUserCharacterLinks(ctx, userID)
		if err != nil {
			return err
		}
		for _, row := range rows {
			if row.LinkSource == source {
				resp.Linked = append(resp.Linked, db2sdk.LinkedCharacter(row))
			}
		}
		return nil
	}, nil)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	h.storeSyncResponse(ctx, userID, source, resp)
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// storeSyncResponse caches the sync outcome so GetExternalSyncStatus can keep
// showing conflicts/unmatched characters. Best effort: failures only log via
// the response staying empty, never fail the sync itself.
func (h *Handler) storeSyncResponse(ctx context.Context, userID uuid.UUID, source string, resp chroniclesdk.ExternalSyncResponse) {
	payload, err := json.Marshal(resp)
	if err != nil {
		return
	}
	_ = h.zed.UpdateExternalCharacterLinkSyncResponse(ctx, database.UpdateExternalCharacterLinkSyncResponseParams{
		UserID:       userID,
		Source:       source,
		LastResponse: payload,
	})
}

// GetExternalSyncStatus returns the cached result of the user's most recent
// external sync, or 204 when the user has never synced (or the last sync
// failed before producing a result).
func (h *Handler) GetExternalSyncStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := chronauth.AuthenticationState(r)

	config := h.externalVerification
	if config == nil {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "External verification is not enabled for this site",
		})
		return
	}

	sync, err := h.zed.GetExternalCharacterLinkSync(ctx, database.GetExternalCharacterLinkSyncParams{
		UserID: state.Claims.Subject,
		Source: zugzuglink.Source(config.URL),
	})
	if errors.Is(err, sql.ErrNoRows) || (err == nil && len(sync.LastResponse) == 0) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	var resp chroniclesdk.ExternalSyncResponse
	if err := json.Unmarshal(sync.LastResponse, &resp); err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}
