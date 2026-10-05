package gamedataapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func requireRootScope(w http.ResponseWriter, r *http.Request) bool {
	if servicetenant.TenantFromContext(r.Context()) == nil {
		return true
	}
	httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{
		Message: "dataset class buff management is only available from the root domain",
	})
	return false
}

func (h *Handler) ListClassBuffIgnorePolicies(w http.ResponseWriter, r *http.Request) {
	if !requireRootScope(w, r) {
		return
	}
	ctx := servicetenant.AdminBypass(r.Context())
	rows, err := database.New(h.pool).ListClassBuffIgnorePolicies(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	policies := make([]chroniclesdk.ClassBuffIgnorePolicy, 0, len(rows))
	for _, row := range rows {
		policies = append(policies, chroniclesdk.ClassBuffIgnorePolicy{
			DatasetID: row.DatasetID,
			SpellName: row.SpellName,
			Ignored:   row.Ignored,
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, policies)
}

func (h *Handler) SetClassBuffIgnores(w http.ResponseWriter, r *http.Request) {
	if !requireRootScope(w, r) {
		return
	}
	ctx := servicetenant.AdminBypass(r.Context())
	var req chroniclesdk.SetClassBuffIgnoresRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	req.SpellName = strings.TrimSpace(req.SpellName)
	if req.SpellName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "spell_name is required"})
		return
	}
	if len(req.DatasetIDs) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "select at least one dataset"})
		return
	}

	datasetIDs := make(map[uuid.UUID]struct{}, len(req.DatasetIDs))
	for _, datasetID := range req.DatasetIDs {
		if datasetID == uuid.Nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "dataset_ids cannot contain the nil UUID"})
			return
		}
		datasetIDs[datasetID] = struct{}{}
	}

	store := database.New(h.pool)
	for datasetID := range datasetIDs {
		if _, err := store.GetDataset(ctx, datasetID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "unknown dataset_id"})
				return
			}
			httpapi.InternalServerError(w, err)
			return
		}
	}

	if err := store.InTx(ctx, func(tx database.Store) error {
		for datasetID := range datasetIDs {
			if err := tx.UpsertClassBuffIgnore(ctx, database.UpsertClassBuffIgnoreParams{
				DatasetID: datasetID,
				SpellName: req.SpellName,
				Ignored:   req.Ignored,
			}); err != nil {
				return err
			}
		}
		return nil
	}, nil); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
