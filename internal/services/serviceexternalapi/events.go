package serviceexternalapi

import (
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func (s *Service) getInstanceEventsBySlug(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	eventType := chi.URLParam(r, "type")
	if !database.LogInstanceEventType(eventType).Valid() {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid event stream type"})
		return
	}

	slug := chi.URLParam(r, "slug")
	instance, err := s.db.InstanceBySlug(ctx, pgtype.Text{String: slug, Valid: slug != ""})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w, r, "Instance not found")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	events, err := s.db.InstanceEvent(ctx, database.InstanceEventParams{
		InstanceID: instance.ID,
		Type:       eventType,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w, r, "Event stream not found")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(events.Events)
}
