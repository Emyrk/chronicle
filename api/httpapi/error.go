package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

type APIError struct {
	Response chroniclesdk.Response
	Status   int
	Wrapped  error
}

func (e *APIError) Error() string {
	return e.Wrapped.Error()
}

func (e *APIError) Unwrap() error {
	return e.Wrapped
}

func (e *APIError) Detail(v string) *APIError {
	e.Response.Detail = v
	return e
}

func (e *APIError) CTA(v string) *APIError {
	e.Response.CallToAction = v
	return e
}

func (e *APIError) Link(text, u string) *APIError {
	e.Response.Link = u
	e.Response.LinkText = text
	return e
}

func NewAPIError(err error, message string, status int) *APIError {
	return &APIError{
		Response: chroniclesdk.Response{
			Message: message,
			Detail:  err.Error(),
		},
		Status:  status,
		Wrapped: err,
	}
}

func IsAPIError(err error) (*APIError, bool) {
	var apiErr *APIError
	ok := errors.As(err, &apiErr)
	return apiErr, ok
}

func HandleResponseError(ctx context.Context, rw http.ResponseWriter, err error, def APIError) {
	if apiErr, ok := IsAPIError(err); ok {
		Write(ctx, rw, apiErr.Status, apiErr.Response)
		return
	}

	status := def.Status
	if errors.Is(err, sql.ErrNoRows) {
		status = http.StatusNotFound
	}
	if status == 0 {
		status = http.StatusInternalServerError
	}

	Write(ctx, rw, status, chroniclesdk.Response{
		Message: def.Response.Message,
		Detail:  def.Response.Detail,
	})
}
