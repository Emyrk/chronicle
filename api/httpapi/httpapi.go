package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

// DatasetHeader is set on responses whose game data is resolved from a
// specific dataset. It exposes the resolved dataset ID for debugging.
const DatasetHeader = "X-Chronicle-Dataset"

func Forbidden(rw http.ResponseWriter, err error) {
	var details string
	if err != nil {
		details = err.Error()
	}

	Write(context.Background(), rw, http.StatusForbidden, chroniclesdk.Response{
		Message: "Forbidden: you don't have permission to access this resource.",
		Detail:  details,
	})
}

func InternalServerError(rw http.ResponseWriter, err error) {
	var details string
	if err != nil {
		details = err.Error()
	}

	Write(context.Background(), rw, http.StatusInternalServerError, chroniclesdk.Response{
		Message: "An internal server error occurred.",
		Detail:  details,
	})
}

func Write(_ context.Context, rw http.ResponseWriter, status int, response interface{}) {
	buf := &bytes.Buffer{}
	enc := json.NewEncoder(buf)
	enc.SetEscapeHTML(true)
	// Pretty up JSON when testing.
	if flag.Lookup("test.v") != nil {
		enc.SetIndent("", "\t")
	}
	err := enc.Encode(response)
	if err != nil {
		http.Error(rw, err.Error(), http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json; charset=utf-8")
	rw.WriteHeader(status)
	if status == http.StatusNoContent {
		return
	}
	_, err = rw.Write(buf.Bytes())
	if err != nil {
		//http.Error(rw, err.Error(), http.StatusInternalServerError)
		return
	}
}

// Read decodes JSON from the HTTP request into the value provided.
func Read(ctx context.Context, rw http.ResponseWriter, r *http.Request, value interface{}) bool {
	err := json.NewDecoder(r.Body).Decode(value)
	if err != nil {
		Write(ctx, rw, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Request body must be valid JSON.",
			Detail:  err.Error(),
		})
		return false
	}
	return true
}
