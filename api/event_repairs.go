package api

import (
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/services/serviceeventrepair"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (api *API) AdminListEventRepairs(w http.ResponseWriter, r *http.Request) {
	operations, err := serviceeventrepair.New(api.Opts.DB, api.Queues).List(r.Context())
	if err != nil {
		writeEventRepairError(w, r, err)
		return
	}
	response := chroniclesdk.EventRepairOperationsResponse{Operations: make([]chroniclesdk.EventRepairOperation, 0, len(operations))}
	for _, operation := range operations {
		response.Operations = append(response.Operations, eventRepairOperation(operation))
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

func (api *API) AdminCreateEventRepair(w http.ResponseWriter, r *http.Request) {
	var request chroniclesdk.CreateEventRepairRequest
	if !httpapi.Read(r.Context(), w, r, &request) {
		return
	}
	operation, err := serviceeventrepair.New(api.Opts.DB, api.Queues).Create(r.Context(), chronauth.MustAuthenticatedClaims(r.Context()).Subject, eventRepairRequest(request))
	if err != nil {
		writeEventRepairError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusAccepted, eventRepairOperation(operation))
}

func (api *API) AdminGetEventRepair(w http.ResponseWriter, r *http.Request) {
	id, ok := eventRepairID(w, r)
	if !ok {
		return
	}
	operation, err := serviceeventrepair.New(api.Opts.DB, api.Queues).Get(r.Context(), id)
	if err != nil {
		writeEventRepairError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, eventRepairOperation(operation))
}

func (api *API) AdminApplyEventRepair(w http.ResponseWriter, r *http.Request) {
	id, ok := eventRepairID(w, r)
	if !ok {
		return
	}
	operation, err := serviceeventrepair.New(api.Opts.DB, api.Queues).Apply(r.Context(), id, chronauth.MustAuthenticatedClaims(r.Context()).Subject)
	if err != nil {
		writeEventRepairError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusAccepted, eventRepairOperation(operation))
}

func (api *API) AdminCancelEventRepair(w http.ResponseWriter, r *http.Request) {
	id, ok := eventRepairID(w, r)
	if !ok {
		return
	}
	operation, err := serviceeventrepair.New(api.Opts.DB, api.Queues).Cancel(r.Context(), id, chronauth.MustAuthenticatedClaims(r.Context()).Subject)
	if err != nil {
		writeEventRepairError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, eventRepairOperation(operation))
}

func eventRepairID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "operationID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid event repair operation ID"})
		return uuid.Nil, false
	}
	return id, true
}

func writeEventRepairError(w http.ResponseWriter, r *http.Request, err error) {
	var status int
	switch {
	case errors.Is(err, serviceeventrepair.ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, serviceeventrepair.ErrConflict):
		status = http.StatusConflict
	case errors.Is(err, serviceeventrepair.ErrNotFound):
		status = http.StatusNotFound
	default:
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, status, chroniclesdk.Response{Message: err.Error()})
}

func eventRepairRequest(request chroniclesdk.CreateEventRepairRequest) serviceeventrepair.CreateRequest {
	return serviceeventrepair.CreateRequest{Operation: request.Operation, Instance: request.Instance, TenantID: request.TenantID, Limit: request.Limit, RealmID: request.RealmID, After: request.After, Before: request.Before}
}

func eventRepairOperation(operation serviceeventrepair.Operation) chroniclesdk.EventRepairOperation {
	selection := operation.Selection
	result := chroniclesdk.EventRepairOperation{
		ID: operation.ID, Operation: operation.Operation, Version: operation.Version, State: operation.State,
		CreatedAt: operation.CreatedAt, UpdatedAt: operation.UpdatedAt, CreatedBy: operation.CreatedBy, TenantID: operation.TenantID,
		Selection: chroniclesdk.CreateEventRepairRequest{Operation: selection.Operation, Instance: selection.Instance, TenantID: selection.TenantID, Limit: selection.Limit, RealmID: selection.RealmID, After: selection.After, Before: selection.Before},
		Total:     operation.Total, Processed: operation.Processed, Applied: operation.Applied, Skipped: operation.Skipped, LastError: operation.LastError,
		Items: make([]chroniclesdk.EventRepairItem, 0, len(operation.Items)),
	}
	for _, item := range operation.Items {
		result.Items = append(result.Items, chroniclesdk.EventRepairItem{InstanceID: item.InstanceID, State: item.State, Reason: item.Reason, EvidenceHash: item.EvidenceHash, Changes: append([]string{}, item.Changes...)})
	}
	return result
}
