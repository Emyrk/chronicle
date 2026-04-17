package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/semverenc"
	"github.com/Emyrk/chronicle/internal/slice"
)

// SpeedrunLeaderboard returns the best qualified speedrun per duplicate group
// for a given instance name.
//
//	GET /api/v1/leaderboard/speedrun?instance_name=Molten+Core
func (api *API) SpeedrunLeaderboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	rows, err := api.Opts.Zed.SpeedrunLeaderboard(ctx, instanceName)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch speedrun leaderboard",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, slice.List(rows, db2sdk.SpeedrunLeaderboardEntry))
}

// AdminListLeaderboardVersionRequirements returns all configured version requirements.
//
//	GET /api/v1/admin/leaderboard/version-requirements
func (api *API) AdminListLeaderboardVersionRequirements(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := api.Opts.Zed.ListLeaderboardVersionRequirements(ctx)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to list version requirements",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, slice.List(rows, db2sdk.LeaderboardVersionRequirements))
}

// AdminUpsertLeaderboardVersionRequirements creates or updates version requirements
// for a given instance name. The human-readable version strings are encoded to
// integers server-side for SQL comparison.
//
//	PUT /api/v1/admin/leaderboard/version-requirements
func (api *API) AdminUpsertLeaderboardVersionRequirements(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.LeaderboardVersionRequirements
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.InstanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name is required",
		})
		return
	}

	row, err := api.Opts.Zed.UpsertLeaderboardVersionRequirements(ctx, database.UpsertLeaderboardVersionRequirementsParams{
		InstanceName:        req.InstanceName,
		MinParserVersion:    req.MinParserVersion,
		MinParserVersionNum: semverenc.Encode(req.MinParserVersion),
		MinAddonVersion:     req.MinAddonVersion,
		MinAddonVersionNum:  semverenc.Encode(req.MinAddonVersion),
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to upsert version requirements",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.LeaderboardVersionRequirements(row))
}
