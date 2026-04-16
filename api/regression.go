package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (api *API) RegressionListFixtures(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	fixtures, err := api.Zed.ListRegressionFixtures(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := make([]chroniclesdk.RegressionFixture, 0, len(fixtures))
	for _, f := range fixtures {
		resp = append(resp, chroniclesdk.RegressionFixture{
			ID:         f.ID,
			LogGroupID: f.LogGroupID,
			Note:       f.Note,
			CreatedAt:  f.CreatedAt.Time,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (api *API) RegressionCreateFixture(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.CreateRegressionFixtureRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	fixture, err := api.Zed.InsertRegressionFixture(ctx, database.InsertRegressionFixtureParams{
		LogGroupID: req.LogGroupID,
		Note:       req.Note,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.RegressionFixture{
		ID:         fixture.ID,
		LogGroupID: fixture.LogGroupID,
		Note:       fixture.Note,
		CreatedAt:  fixture.CreatedAt.Time,
	})
}

func (api *API) RegressionUpdateFixtureNote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	fixtureID, err := uuid.Parse(chi.URLParam(r, "fixtureID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid fixture ID",
			Detail:  err.Error(),
		})
		return
	}

	var req chroniclesdk.UpdateRegressionFixtureNoteRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	err = api.Zed.UpdateRegressionFixtureNote(ctx, database.UpdateRegressionFixtureNoteParams{
		ID:   fixtureID,
		Note: req.Note,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) RegressionDeleteFixture(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	fixtureID, err := uuid.Parse(chi.URLParam(r, "fixtureID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid fixture ID",
			Detail:  err.Error(),
		})
		return
	}

	err = api.Zed.DeleteRegressionFixture(ctx, fixtureID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) RegressionTakeSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	fixtureID, err := uuid.Parse(chi.URLParam(r, "fixtureID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid fixture ID",
			Detail:  err.Error(),
		})
		return
	}

	_, err = api.Chronicle.EnqueueRegressionSnapshot(ctx, fixtureID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.Response{
		Message: "Snapshot job enqueued",
	})
}

func (api *API) RegressionSnapshotAll(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	fixtures, err := api.Zed.ListRegressionFixtures(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	enqueued := 0
	for _, f := range fixtures {
		_, err := api.Chronicle.EnqueueRegressionSnapshot(ctx, f.ID)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		enqueued++
	}

	httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.Response{
		Message: fmt.Sprintf("Enqueued %d snapshot jobs", enqueued),
	})
}

func (api *API) RegressionListSnapshots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	fixtureID, err := uuid.Parse(chi.URLParam(r, "fixtureID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid fixture ID",
			Detail:  err.Error(),
		})
		return
	}

	rows, err := api.Zed.ListRegressionSnapshots(ctx, database.ListRegressionSnapshotsParams{
		FixtureID: fixtureID,
		Lim:       100,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := make([]chroniclesdk.RegressionSnapshotSummary, 0, len(rows))
	for _, row := range rows {
		resp = append(resp, chroniclesdk.RegressionSnapshotSummary{
			ID:        row.ID,
			FixtureID: row.FixtureID,
			Version:   row.Version,
			CreatedAt: row.CreatedAt.Time,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (api *API) RegressionGetSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	snapshotID, err := uuid.Parse(chi.URLParam(r, "snapshotID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid snapshot ID",
			Detail:  err.Error(),
		})
		return
	}

	snapshot, err := api.Zed.GetRegressionSnapshot(ctx, snapshotID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.RegressionSnapshotFull{
		RegressionSnapshotSummary: chroniclesdk.RegressionSnapshotSummary{
			ID:        snapshot.ID,
			FixtureID: snapshot.FixtureID,
			Version:   snapshot.Version,
			CreatedAt: snapshot.CreatedAt.Time,
		},
		Snapshot: json.RawMessage(snapshot.Snapshot),
	})
}

func (api *API) RegressionRequeueVersion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.RequeueVersionRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Version == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Version is required",
		})
		return
	}

	instances, err := api.Zed.ListInstancesByParserVersion(ctx, req.Version)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Collect distinct log group IDs
	seen := make(map[uuid.UUID]struct{})
	for _, inst := range instances {
		seen[inst.LogGroupID] = struct{}{}
	}

	requeued := 0
	for logGroupID := range seen {
		_, err := api.Chronicle.EnqueueReParseLog(ctx, logGroupID, false)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		requeued++
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.RequeueVersionResponse{
		RequeuedCount: requeued,
	})
}
