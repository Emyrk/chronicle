package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
)

// AdminLinkUserCharacter links an in-game character to a user account.
// A character can only be linked to a single account at a time.
func (api *API) AdminLinkUserCharacter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := chronauth.AuthenticationState(r)

	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid user ID",
		})
		return
	}

	var req chroniclesdk.LinkCharacterRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	// Ensure the target user exists.
	if _, err := api.Opts.Zed.GetUserByID(ctx, userID); err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "User not found"},
			Status:   http.StatusNotFound,
		})
		return
	}

	// Ensure the character exists on the realm.
	if _, err := api.Opts.Zed.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{
		RealmID:    req.RealmID,
		Identifier: req.CharacterGUID,
	}); err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Character not found"},
			Status:   http.StatusNotFound,
		})
		return
	}

	_, err = api.Opts.Zed.InsertUserCharacterLink(ctx, database.InsertUserCharacterLinkParams{
		UserID:        userID,
		CharacterGuid: req.CharacterGUID,
		RealmID:       req.RealmID,
		LinkedBy:      uuid.NullUUID{UUID: state.Claims.Subject, Valid: true},
	})
	if err != nil {
		if database.IsUniqueViolation(err, database.UniqueUserCharacterLinksCharacterGuidRealmIDKey) {
			httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
				Message: "Character is already linked to an account",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	linked, err := api.linkedCharacter(r, userID, req.CharacterGUID, req.RealmID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusCreated, linked)
}

// AdminUnlinkUserCharacter removes a character link from a user account.
func (api *API) AdminUnlinkUserCharacter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid user ID",
		})
		return
	}

	api.unlinkCharacter(w, r, &userID)
}

// UnlinkMyCharacter removes a character link from the authenticated user's
// own account. Authorization is the manage_link permission (owner or user
// admin), not the admin middleware.
func (api *API) UnlinkMyCharacter(w http.ResponseWriter, r *http.Request) {
	api.unlinkCharacter(w, r, nil)
}

// unlinkCharacter deletes a character link after verifying the actor holds
// manage_link on the character (owner + chronicle->admin_users per the zed
// policy). If expectUserID is set, the link must belong to that user.
func (api *API) unlinkCharacter(w http.ResponseWriter, r *http.Request, expectUserID *uuid.UUID) {
	ctx := r.Context()

	realmID, err := uuid.Parse(chi.URLParam(r, "realmID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid realm ID",
		})
		return
	}

	characterGUID, err := guid.FromString(chi.URLParam(r, "characterGUID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid character GUID",
		})
		return
	}

	state := chronauth.AuthenticationState(r)
	b := policy.New()
	ok, err := api.Opts.Zed.CheckOne(ctx, nil, b.Armory_player(characterGUID).CanManage_link_User(b.User(state.Claims.Subject)))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !ok {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: "You are not allowed to manage this character's link",
		})
		return
	}

	link, err := api.Opts.Zed.GetUserCharacterLink(ctx, database.GetUserCharacterLinkParams{
		CharacterGuid: characterGUID,
		RealmID:       realmID,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Character link not found"},
			Status:   http.StatusNotFound,
		})
		return
	}
	if expectUserID != nil && link.UserID != *expectUserID {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "Character is not linked to this user",
		})
		return
	}

	if _, err := api.Opts.Zed.DeleteUserCharacterLink(ctx, database.DeleteUserCharacterLinkParams{
		CharacterGuid: characterGUID,
		RealmID:       realmID,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Character unlinked",
	})
}

// ListMyCharacters lists the characters linked to the authenticated user.
func (api *API) ListMyCharacters(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := chronauth.AuthenticationState(r)

	rows, err := api.Opts.Zed.GetUserCharacterLinks(ctx, state.Claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.LinkedCharacters(rows))
}

// SetMyPrimaryCharacter marks one of the user's linked characters as primary.
func (api *API) SetMyPrimaryCharacter(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := chronauth.AuthenticationState(r)
	userID := state.Claims.Subject

	var req chroniclesdk.SetPrimaryCharacterRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	err := api.Opts.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if err := tx.UnsetPrimaryUserCharacter(ctx, userID); err != nil {
			return err
		}
		_, err := tx.SetPrimaryUserCharacter(ctx, database.SetPrimaryUserCharacterParams{
			UserID:        userID,
			CharacterGuid: req.CharacterGUID,
			RealmID:       req.RealmID,
		})
		return err
	}, nil)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
				Message: "Character is not linked to your account",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	rows, err := api.Opts.Zed.GetUserCharacterLinks(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, db2sdk.LinkedCharacters(rows))
}

// linkedCharacter fetches a single linked character (joined with player data)
// for a user.
func (api *API) linkedCharacter(r *http.Request, userID uuid.UUID, characterGUID guid.GUID, realmID uuid.UUID) (chroniclesdk.LinkedCharacter, error) {
	rows, err := api.Opts.Zed.GetUserCharacterLinks(r.Context(), userID)
	if err != nil {
		return chroniclesdk.LinkedCharacter{}, err
	}
	for _, row := range rows {
		if row.CharacterGuid == characterGUID && row.RealmID == realmID {
			return db2sdk.LinkedCharacter(row), nil
		}
	}
	return chroniclesdk.LinkedCharacter{}, sql.ErrNoRows
}
