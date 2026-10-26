package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database/storage"
)

const (
	runStillCacheControl = "public, max-age=86400"
	// A missing still is asked for again soon: the render job is already queued.
	runStillMissingCacheControl = "public, max-age=300"
)

// InstanceRunStill returns the instance's 640x360 replay still (JPG). Before
// the still exists it queues the render and answers 404, so the page shows
// its fallback art and the next visit gets the still.
// @Summary Replay still of an instance
// @Tags raidlogs
// @Produce jpeg
// @Param instance_id path string true "Instance ID or slug"
// @Success 200
// @Router /api/v1/raidlogs/instances/{instance_id}/still.jpg [get]
func (api *API) InstanceRunStill(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	inst := httpmw.Instance(ctx)

	still, err := api.Chronicle.RunStill(ctx, inst.ID)
	if err == nil {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", runStillCacheControl)
		w.Header().Set("Content-Length", strconv.Itoa(len(still)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(still)
		return
	}
	if !errors.Is(err, storage.ErrFileNotFound) {
		httpapi.InternalServerError(w, err)
		return
	}

	if !httpmw.InstanceUnlisted(ctx) && chronicle.HasRunStillPositions(inst.Capabilities) {
		if err := api.Chronicle.EnqueueRunStill(ctx, inst.ID); err != nil {
			api.Opts.Logger.WarnContext(ctx, "failed to enqueue run still", slog.String("instance_id", inst.ID.String()), slog.Any("error", err))
		}
	}
	w.Header().Set("Cache-Control", runStillMissingCacheControl)
	httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "No replay still for this instance yet"})
}
