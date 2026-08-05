package gearbuilderapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// PublishGearListRevision snapshots the owner's current list state as the
// next immutable revision.
func (h *Handler) PublishGearListRevision(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	listID, err := uuid.Parse(chi.URLParam(r, "listID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid list ID"})
		return
	}

	rev, err := h.zed.PublishGearListRevision(ctx, database.PublishGearListRevisionParams{
		ID:          uuid.New(),
		PublishedBy: claims.Subject,
		ListID:      listID,
		UserID:      claims.Subject,
		TenantID:    servicetenant.TenantIDFromContext(ctx),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear list not found"})
			return
		}
		if database.IsUniqueViolation(err, database.UniqueGearListRevisionsUnique) {
			httpapi.Write(ctx, w, http.StatusConflict, map[string]string{"error": "a revision was published concurrently, try again"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, revisionToSDK(rev))
}

// ListGearListRevisions returns revision summaries, subject to the list's
// visibility (owners see revisions of their private lists).
func (h *Handler) ListGearListRevisions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	list, ok := h.viewableList(w, r)
	if !ok {
		return
	}

	revs, err := h.zed.ListGearListRevisions(ctx, list.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	result := make([]chroniclesdk.GearListRevisionSummary, 0, len(revs))
	for _, rev := range revs {
		result = append(result, chroniclesdk.GearListRevisionSummary{
			ID:          rev.ID,
			ListID:      rev.ListID,
			RevNumber:   rev.RevNumber,
			Title:       rev.Title,
			PublishedBy: rev.PublishedBy,
			PublishedAt: rev.PublishedAt.Time,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

// GetGearListRevision returns one published revision with its payload.
func (h *Handler) GetGearListRevision(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	list, ok := h.viewableList(w, r)
	if !ok {
		return
	}

	revNumber, err := strconv.ParseInt(chi.URLParam(r, "revNumber"), 10, 32)
	if err != nil || revNumber < 1 {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid revision number"})
		return
	}

	rev, err := h.zed.GetGearListRevision(ctx, database.GetGearListRevisionParams{
		ListID:    list.ID,
		RevNumber: int32(revNumber),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "revision not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, revisionToSDK(rev))
}

// ForkGearList copies a list (live state, or a chosen published revision)
// into a new private list owned by the caller, recording lineage.
func (h *Handler) ForkGearList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	listID, err := uuid.Parse(chi.URLParam(r, "listID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid list ID"})
		return
	}

	var req chroniclesdk.ForkGearListRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	source, err := h.zed.GetGearListByID(ctx, listID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear list not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}
	if !canViewList(source, ctx) {
		httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear list not found"})
		return
	}

	// The copied content: the live draft, or a specific published revision.
	title, description := source.Title, source.Description
	classID, specName := source.ClassID, source.SpecName
	payload := source.Payload
	forkedRev := pgtype.Int4{}
	if req.RevNumber != nil {
		rev, err := h.zed.GetGearListRevision(ctx, database.GetGearListRevisionParams{
			ListID:    source.ID,
			RevNumber: *req.RevNumber,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "revision not found"})
				return
			}
			httpapi.InternalServerError(w, err)
			return
		}
		title, description = rev.Title, rev.Description
		classID, specName = rev.ClassID, rev.SpecName
		payload = rev.Payload
		forkedRev = pgtype.Int4{Int32: rev.RevNumber, Valid: true}
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	count, err := h.zed.CountUserGearLists(ctx, database.CountUserGearListsParams{
		UserID:   claims.Subject,
		TenantID: tenantID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if count >= maxUserGearLists {
		httpapi.Write(ctx, w, http.StatusConflict, map[string]string{"error": "gear list limit reached"})
		return
	}

	fork, err := h.zed.CreateGearList(ctx, database.CreateGearListParams{
		ID:                  uuid.New(),
		UserID:              claims.Subject,
		TenantID:            tenantID,
		Title:               title,
		Description:         description,
		ClassID:             classID,
		SpecName:            specName,
		Visibility:          "private",
		Payload:             payload,
		ForkedFromListID:    uuid.NullUUID{UUID: source.ID, Valid: true},
		ForkedFromRevNumber: forkedRev,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, gearListToSDK(fork))
}

// viewableList loads the {listID} route param's list and enforces the
// visibility rule, writing the error response on failure.
func (h *Handler) viewableList(w http.ResponseWriter, r *http.Request) (database.GearList, bool) {
	ctx := r.Context()
	listID, err := uuid.Parse(chi.URLParam(r, "listID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid list ID"})
		return database.GearList{}, false
	}

	list, err := h.zed.GetGearListByID(ctx, listID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear list not found"})
			return database.GearList{}, false
		}
		httpapi.InternalServerError(w, err)
		return database.GearList{}, false
	}
	if !canViewList(list, ctx) {
		httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear list not found"})
		return database.GearList{}, false
	}
	return list, true
}

func revisionToSDK(rev database.GearListRevision) chroniclesdk.GearListRevision {
	return chroniclesdk.GearListRevision{
		ID:          rev.ID,
		ListID:      rev.ListID,
		RevNumber:   rev.RevNumber,
		Title:       rev.Title,
		Description: rev.Description,
		ClassID:     rev.ClassID,
		SpecName:    rev.SpecName,
		Payload:     rev.Payload,
		PublishedBy: rev.PublishedBy,
		PublishedAt: rev.PublishedAt.Time,
	}
}
