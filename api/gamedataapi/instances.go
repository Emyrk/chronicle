package gamedataapi

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// ListInstances returns all instance templates.
func (h *Handler) ListInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	store := database.New(h.pool)
	templates, err := store.ListWorldInstanceTemplates(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Fetch zone names for all templates.
	zoneNamesByInstance := make(map[uuid.UUID][]database.WorldInstanceZoneName)
	allZoneNames, err := store.ListWorldInstanceZoneNames(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	for _, zn := range allZoneNames {
		zoneNamesByInstance[zn.InstanceID] = append(zoneNamesByInstance[zn.InstanceID], zn)
	}

	result := make([]chroniclesdk.WorldInstanceTemplate, 0, len(templates))
	for _, t := range templates {
		result = append(result, db2sdk.WorldInstanceTemplate(t, zoneNamesByInstance[t.ID]))
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

// UpsertInstance creates or updates an instance template.
func (h *Handler) UpsertInstance(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.UpsertWorldInstanceTemplateRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Name == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "name is required",
		})
		return
	}

	store := database.New(h.pool)

	var wit database.WorldInstanceTemplate
	var zoneNames []database.WorldInstanceZoneName

	err := store.InTx(func(tx database.Store) error {
		abbrev := pgtype.Text{}
		if req.Abbreviation != "" {
			abbrev = pgtype.Text{String: req.Abbreviation, Valid: true}
		}
		bossCount := pgtype.Int4{}
		if req.BossCount != nil {
			bossCount = pgtype.Int4{Int32: *req.BossCount, Valid: true}
		}
		background := pgtype.Text{}
		if req.Background != "" {
			background = pgtype.Text{String: req.Background, Valid: true}
		}

		var txErr error
		wit, txErr = tx.UpsertWorldInstanceTemplate(ctx, database.UpsertWorldInstanceTemplateParams{
			Name:         req.Name,
			Abbreviation: abbrev,
			Category:     database.InstanceCategory(req.Category),
			BossCount:    bossCount,
			Background:   background,
		})
		if txErr != nil {
			return txErr
		}

		// Replace zone names.
		txErr = tx.DeleteWorldInstanceZoneNames(ctx, wit.ID)
		if txErr != nil {
			return txErr
		}
		for _, zn := range req.ZoneNames {
			txErr = tx.InsertWorldInstanceZoneName(ctx, database.InsertWorldInstanceZoneNameParams{
				InstanceID:  wit.ID,
				ZoneName:    zn.ZoneName,
				DisplayName: zn.DisplayName,
			})
			if txErr != nil {
				return txErr
			}
		}

		zoneNames, txErr = tx.GetWorldInstanceZoneNames(ctx, wit.ID)
		return txErr
	}, nil)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	h.notifyInstanceDataChanged()
	httpapi.Write(ctx, w, http.StatusOK, db2sdk.WorldInstanceTemplate(wit, zoneNames))
}

// DeleteInstance deletes an instance template by ID.
func (h *Handler) DeleteInstance(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instanceIDStr := chi.URLParam(r, "instanceID")
	instanceID, err := uuid.Parse(instanceIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid instance ID",
		})
		return
	}

	store := database.New(h.pool)
	err = store.DeleteWorldInstanceTemplate(ctx, instanceID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	h.notifyInstanceDataChanged()
	w.WriteHeader(http.StatusNoContent)
}

// ListInstanceUnits returns all units for an instance template.
func (h *Handler) ListInstanceUnits(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instanceIDStr := chi.URLParam(r, "instanceID")
	instanceID, err := uuid.Parse(instanceIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid instance ID",
		})
		return
	}

	store := database.New(h.pool)
	units, err := store.GetWorldInstanceUnits(ctx, instanceID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	result := make([]chroniclesdk.WorldInstanceUnit, 0, len(units))
	for _, u := range units {
		result = append(result, db2sdk.WorldInstanceUnit(u))
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

// BulkUpsertInstanceUnits creates or updates units for an instance template.
func (h *Handler) BulkUpsertInstanceUnits(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instanceIDStr := chi.URLParam(r, "instanceID")
	instanceID, err := uuid.Parse(instanceIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid instance ID",
		})
		return
	}

	var req chroniclesdk.BulkUpsertWorldInstanceUnitsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	store := database.New(h.pool)

	for _, u := range req.Units {
		encounterName := pgtype.Text{}
		if u.EncounterName != "" {
			encounterName = pgtype.Text{String: u.EncounterName, Valid: true}
		}
		overrideName := pgtype.Text{}
		if u.OverrideName != "" {
			overrideName = pgtype.Text{String: u.OverrideName, Valid: true}
		}
		err = store.UpsertWorldInstanceUnit(ctx, database.UpsertWorldInstanceUnitParams{
			InstanceID:    instanceID,
			EntryID:       u.EntryID,
			OverrideName:  overrideName,
			EncounterName: encounterName,
			Boss:          u.Boss,
			Affiliation:   database.UnitAffiliation(u.Affiliation),
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}

	// Return all units after upsert.
	units, err := store.GetWorldInstanceUnits(ctx, instanceID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	result := make([]chroniclesdk.WorldInstanceUnit, 0, len(units))
	for _, u := range units {
		result = append(result, db2sdk.WorldInstanceUnit(u))
	}

	h.notifyInstanceDataChanged()
	httpapi.Write(ctx, w, http.StatusOK, result)
}

// PublicListInstances returns instance configs for the frontend (public, no auth required).
func (h *Handler) PublicListInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	store := database.New(h.pool)
	templates, err := store.ListWorldInstanceTemplates(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	allZoneNames, err := store.ListWorldInstanceZoneNames(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	zoneNamesByInstance := make(map[uuid.UUID][]database.WorldInstanceZoneName)
	for _, zn := range allZoneNames {
		zoneNamesByInstance[zn.InstanceID] = append(zoneNamesByInstance[zn.InstanceID], zn)
	}

	result := make([]chroniclesdk.WorldInstanceTemplate, 0, len(templates))
	for _, t := range templates {
		result = append(result, db2sdk.WorldInstanceTemplate(t, zoneNamesByInstance[t.ID]))
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

// AssignWorldToServer assigns a world to a server.
func (h *Handler) AssignWorldToServer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	worldID, err := uuid.Parse(chi.URLParam(r, "worldID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid world ID",
		})
		return
	}
	serverID, err := uuid.Parse(chi.URLParam(r, "serverID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid server ID",
		})
		return
	}

	store := database.New(h.pool)
	err = store.AssignWorldToServer(ctx, database.AssignWorldToServerParams{
		ServerID: serverID,
		WorldID:  worldID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	h.notifyInstanceDataChanged()
	w.WriteHeader(http.StatusNoContent)
}

// UnassignWorldFromServer removes a world from a server.
func (h *Handler) UnassignWorldFromServer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	worldID, err := uuid.Parse(chi.URLParam(r, "worldID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid world ID",
		})
		return
	}
	serverID, err := uuid.Parse(chi.URLParam(r, "serverID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid server ID",
		})
		return
	}

	store := database.New(h.pool)
	err = store.UnassignWorldFromServer(ctx, database.UnassignWorldFromServerParams{
		ServerID: serverID,
		WorldID:  worldID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	h.notifyInstanceDataChanged()
	w.WriteHeader(http.StatusNoContent)
}
