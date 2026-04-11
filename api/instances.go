package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
)

func (api *API) SupportedInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	reg := registry.DefaultRegistry(api.Opts.Logger)
	httpapi.Write(ctx, w, http.StatusOK, reg.AllInstancesWithComments())
}

func (api *API) InstanceEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)
	db := api.Opts.Zed
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

	db := api.Opts.Zed

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
	db := api.Opts.Zed

	var req chroniclesdk.Video
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	b := policy.New()
	act, ok := authz.ActorFromContext(ctx)
	if !ok {
		httpapi.Forbidden(w, errors.New("no actor in context"))
		return
	}
	actSub := act.Object()

	instObj := b.Instance(inst.ID).Object()
	ok, err := api.Zed.CheckOne(ctx, nil, rel.Relationship{
		ResourceType:     instObj.Typ,
		ResourceID:       instObj.ID,
		ResourceRelation: "upload_youtube",
		SubjectType:      actSub.Typ,
		SubjectID:        actSub.ID,
		SubjectRelation:  "",
	})
	if err != nil || !ok {
		httpapi.Forbidden(w, err)
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
	db := api.Opts.Zed

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

func (api *API) GetInstanceLoot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)
	db := api.Opts.Zed

	loot, err := db.GetInstanceLoot(ctx, inst.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch loot for instance",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.InstanceLoot(loot))
}
