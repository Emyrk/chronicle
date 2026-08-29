package api

import (
	"errors"
	"net/http"
	"slices"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	overviewmetricsversion "github.com/Emyrk/chronicle/internal/overviewmetrics"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (api *API) SupportedInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Resolve per-tenant registry when a tenant is present and has a dataset.
	reg := api.Chronicle.Registry()
	if tenant := servicetenant.TenantFromContext(ctx); tenant != nil && tenant.DefaultDatasetID.Valid {
		if ds, err := api.Opts.Dataset.GetDataset(ctx, tenant.DefaultDatasetID.UUID); err == nil {
			flavor := database.FlavorFromStrings(ds.DefaultFlavor)
			if len(flavor) > 0 {
				reg = api.Chronicle.RegistryForFlavor(flavor)
			}
		}
	}

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
			BossCount: d.BossCount,
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

	phases, err := db.GetEncounterPhasesByInstanceID(ctx, inst.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch encounter phases",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := db2sdk.WowDecoratedInstance(inst, units, players, encounters, fights, phases)
	out.DatasetID = api.Opts.Dataset.ResolveDatasetForRealm(ctx, inst.RealmID)
	if ds, err := api.Opts.Dataset.GetDataset(ctx, out.DatasetID); err == nil {
		out.IconBaseURL = ds.IconBaseUrl
	}
	w.Header().Set(httpapi.DatasetHeader, out.DatasetID.String())
	httpapi.Write(ctx, w, http.StatusOK, out)
}

func (api *API) InstanceOverviewMetrics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)

	metrics, err := api.Opts.Zed.GetInstanceOverviewMetrics(ctx, database.GetInstanceOverviewMetricsParams{
		InstanceID:     inst.ID,
		MetricsVersion: overviewmetricsversion.CurrentVersion,
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "No overview metrics for this instance",
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.InstanceOverviewMetrics(metrics))
}

func (api *API) InstanceRankingRecords(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)

	records, err := api.Opts.Zed.InstanceRankingRecords(ctx, inst.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch instance ranking records",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.InstanceRankingRecords(records))
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
	killTimes, err := api.Opts.Zed.GetInstanceEncounterKillTimes(ctx, inst.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result.EncounterKillTimes = db2sdk.EncounterKillTimes(killTimes)

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

	// Attach data source eligibility status.
	hasServerSide := slices.Contains(sr.Capabilities, "server-side")
	hasAddonVersion := sr.AddonVersion != ""
	result.DataSourceStatus = &chroniclesdk.SpeedrunDataSourceStatus{
		HasServerSide:   hasServerSide,
		HasAddonVersion: hasAddonVersion,
		Eligible:        hasServerSide || hasAddonVersion,
	}

	// Attach DPS rankings status.
	hasRankings, err := api.Opts.Zed.HasInstanceDpsRankings(ctx, inst.ID)
	if err == nil {
		result.DpsRankingsStatus = &chroniclesdk.DpsRankingsStatus{
			HasRankings: hasRankings,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

func (api *API) InstanceSpeedrunCohort(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)

	scope := chroniclesdk.SpeedrunCohortScope(r.URL.Query().Get("scope"))
	if scope != chroniclesdk.SpeedrunCohortScopeServer && scope != chroniclesdk.SpeedrunCohortScopeRealm && scope != chroniclesdk.SpeedrunCohortScopeGuild {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Scope must be server, realm, or guild",
		})
		return
	}
	if scope == chroniclesdk.SpeedrunCohortScopeGuild && !inst.GuildID.Valid {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "This instance is not associated with a guild",
		})
		return
	}

	lookbackDays := int32(60)
	if raw := r.URL.Query().Get("lookback_days"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 32)
		if err != nil || parsed < 1 || parsed > 3650 {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Lookback days must be between 1 and 3650",
			})
			return
		}
		lookbackDays = int32(parsed)
	}

	if _, err := api.Opts.Zed.GetInstanceSpeedrun(ctx, inst.ID); err != nil {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "No speedrun data for this instance",
		})
		return
	}

	rows, err := api.Opts.Zed.InstanceSpeedrunCohort(ctx, database.InstanceSpeedrunCohortParams{
		InstanceID:     inst.ID,
		LookbackDays:   lookbackDays,
		Scope:          string(scope),
		MetricsVersion: overviewmetricsversion.CurrentVersion,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	runs := make([]chroniclesdk.SpeedrunCohortRun, 0, len(rows))
	for _, row := range rows {
		runs = append(runs, db2sdk.SpeedrunCohortRun(row))
	}

	runsWithOverviewMetrics := 0
	for _, run := range runs {
		if run.Overview != nil {
			runsWithOverviewMetrics++
		}
	}
	cohortOverview := db2sdk.SpeedrunCohortOverviewMetrics(rows, runs)

	label := inst.ServerName.String
	var guildID *uuid.UUID
	switch scope {
	case chroniclesdk.SpeedrunCohortScopeRealm:
		label = inst.RealmName
	case chroniclesdk.SpeedrunCohortScopeGuild:
		label = inst.GuildName.String
		guildID = &inst.GuildID.UUID
	}

	windowEnd := inst.StartTime.Time
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.SpeedrunCohortResponse{
		Cohort: chroniclesdk.SpeedrunCohortDefinition{
			Scope:                   scope,
			Label:                   label,
			InstanceName:            inst.Name,
			DifficultyName:          inst.DifficultyName,
			MaxPlayers:              inst.MaxPlayers,
			LookbackDays:            lookbackDays,
			WindowStart:             windowEnd.AddDate(0, 0, -int(lookbackDays)),
			WindowEnd:               windowEnd,
			EligibleRuns:            len(runs),
			RunsWithOverviewMetrics: runsWithOverviewMetrics,
			OverviewMetricsVersion:  overviewmetricsversion.CurrentVersion,
			GuildID:                 guildID,
		},
		Overview: cohortOverview,
		Runs:     runs,
	})
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

	datasetID := api.Opts.Dataset.ResolveDatasetForRealm(ctx, inst.RealmID)
	loot, err := db.GetInstanceLoot(ctx, database.GetInstanceLootParams{
		DatasetID:  datasetID,
		InstanceID: inst.ID,
	})
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
