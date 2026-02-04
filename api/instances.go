package api

import (
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/spice/policy"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/go-chi/chi/v5"
)

func (api *API) InstanceEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)
	db := api.Opts.DB
	eventType := chi.URLParam(r, "type")

	evts, err := db.InstanceEvent(ctx, database.InstanceEventParams{
		InstanceID: inst.ID,
		Type:       eventType,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch instance encounter events",
				Detail:  err.Error(),
			},
		})
		return
	}

	// The conversion to another type is pretty expensive, just use the type as is
	w.Header().Set("Content-Type", "application/octet-stream")
	if httpmw.InstanceByID(ctx) {
		// Instance IDs are uuids
		w.Header().Set("Cache-Control", "public, max-age=315360000")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(evts.Events)
}

func (api *API) Instance(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)

	db := api.Opts.DB

	encounters, err := db.EncountersByInstanceID(ctx, inst.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch encounters for instance",
				Detail:  err.Error(),
			},
		})
		return
	}

	units, err := db.InstanceUnitsByInstanceID(ctx, inst.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch instance units",
				Detail:  err.Error(),
			},
		})
		return
	}

	players, err := db.InstancePlayersByInstanceID(ctx, inst.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch instance players",
				Detail:  err.Error(),
			},
		})
		return
	}

	fights, err := db.GetInstanceEncounterCharacterFights(ctx, inst.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch instance encounter character fights",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.WowDecoratedInstance(inst, units, players, encounters, fights))
}

func (api *API) PostInstanceYoutube(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)
	db := api.Opts.DB

	err := api.Opts.Authz.Check(policy.New().GlobalChronicle().CanUpload_youtube(ctx))
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	var req chroniclesdk.Video
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	err = db.InsertStampedYoutubeVideo(ctx, database.InsertStampedYoutubeVideoParams{
		LogInstanceID: inst.ID,
		CreatedAt:     database.Timestamptz(time.Now()),
		ExportedAt:    database.Timestamptz(req.ExportedAt),
		VideoUrl:      req.URL,
		Payload:       slice.List(req.Results, db2sdk.VideoTimestampToDB),
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to post youtube video for instance",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.Response{
		Message: "Youtube video posted successfully",
	})
}

func (api *API) GetInstanceYoutube(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)
	db := api.Opts.DB

	data, err := db.GetInstanceYoutubeData(ctx, inst.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch youtube videos for instance",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.Video(data))
}
