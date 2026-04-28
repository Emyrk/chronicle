package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (api *API) SupportedInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	reg := api.Chronicle.Registry()
	details := reg.AllInstanceDetails()

	result := make([]chroniclesdk.SupportedInstance, len(details))
	for i, d := range details {
		bosses := make([]chroniclesdk.SupportedInstanceUnit, len(d.Bosses))
		for j, b := range d.Bosses {
			bosses[j] = chroniclesdk.SupportedInstanceUnit{EntryID: b.EntryID, Name: b.Name}
		}
		trash := make([]chroniclesdk.SupportedInstanceUnit, len(d.Trash))
		for j, t := range d.Trash {
			trash[j] = chroniclesdk.SupportedInstanceUnit{EntryID: t.EntryID, Name: t.Name}
		}
		result[i] = chroniclesdk.SupportedInstance{
			Name:      d.Name,
			Comment:   d.Comment,
			Fallback:  d.Fallback,
			ZoneNames: d.ZoneNames,
			Bosses:    bosses,
			Trash:     trash,
		}
	}
	httpapi.Write(ctx, w, http.StatusOK, result)
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

func (api *API) InstanceSpeedrun(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)

	sr, err := api.Opts.Zed.GetInstanceSpeedrun(ctx, inst.ID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "No speedrun data for this instance",
		})
		return
	}

	result := db2sdk.SpeedrunResult(sr)

	// Attach version qualification status if requirements exist.
	req, err := api.Opts.Zed.GetLeaderboardVersionRequirements(ctx, sr.InstanceName)
	if err == nil {
		parserVersion := inst.Versions["chronicle"]
		result.VersionStatus = &chroniclesdk.SpeedrunVersionStatus{
			ParserVersion:    parserVersion,
			MinParserVersion: req.MinParserVersion,
			ParserQualified:  sr.ParserVersionNum >= req.MinParserVersionNum,
			AddonVersion:     sr.AddonVersion,
			MinAddonVersion:  req.MinAddonVersion,
			AddonQualified:   sr.AddonVersionNum >= req.MinAddonVersionNum,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
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

	instanceNullUUID := uuid.NullUUID{UUID: inst.ID, Valid: true}
	_ = db.DeleteYoutubeVideoByInstanceOrSlug(ctx, database.DeleteYoutubeVideoByInstanceOrSlugParams{
		LogInstanceID: instanceNullUUID,
		InstanceSlug:  inst.HashedSlug,
	})
	err = db.InsertStampedYoutubeVideo(ctx, database.InsertStampedYoutubeVideoParams{
		LogInstanceID: instanceNullUUID,
		InstanceSlug:  inst.HashedSlug,
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

	data, err := db.GetInstanceYoutubeData(ctx, database.GetInstanceYoutubeDataParams{
		LogInstanceID: uuid.NullUUID{UUID: inst.ID, Valid: true},
		InstanceSlug:  inst.HashedSlug,
	})
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

// UngroupInstance removes an instance from its duplicate group by clearing
// duplicate_group_id. Requires admin_logs permission.
func (api *API) UngroupInstance(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)

	err := api.Opts.Zed.ClearDuplicateGroupID(ctx, inst.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

// ListDuplicateInstances returns all instances in the same duplicate group.
func (api *API) ListDuplicateInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)

	if !inst.DuplicateGroupID.Valid {
		httpapi.Write(ctx, w, http.StatusOK, []chroniclesdk.DuplicateInstance{})
		return
	}

	rows, err := api.Opts.Zed.ListInstancesByDuplicateGroup(ctx, inst.DuplicateGroupID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	result := make([]chroniclesdk.DuplicateInstance, 0, len(rows))
	for _, row := range rows {
		di := chroniclesdk.DuplicateInstance{
			ID:           row.ID,
			Slug:         row.Slug.String,
			Name:         row.Name,
			RecorderName: row.RecorderName,
			UploaderName: row.UploaderName,
			PlayerCount:  row.PlayerCount,
		}
		if row.DurationMs != 0 {
			d := row.DurationMs
			di.DurationMs = &d
		}
		result = append(result, di)
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}
