package api

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	telemetryNoticeAudiencePublic = "public"
	telemetryNoticeAudienceAdmin  = "admin"
)

type telemetryNoticeListFunc func(context.Context, string) ([]chroniclesdk.TelemetryNotice, error)

func (api *API) ListPublicTelemetryNotices(w http.ResponseWriter, r *http.Request) {
	api.listTelemetryNotices(w, r, telemetryNoticeAudiencePublic, api.listPersistedTelemetryNotices)
}

func (api *API) AdminListTelemetryNotices(w http.ResponseWriter, r *http.Request) {
	api.listTelemetryNotices(w, r, telemetryNoticeAudienceAdmin, api.listPersistedTelemetryNotices)
}

func (api *API) listTelemetryNotices(
	w http.ResponseWriter,
	r *http.Request,
	audience string,
	list telemetryNoticeListFunc,
) {
	ctx := r.Context()
	notices, err := list(ctx, audience)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	filtered := make([]chroniclesdk.TelemetryNotice, 0, len(notices))
	for _, notice := range notices {
		if notice.Audience == audience {
			filtered = append(filtered, notice)
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TelemetryNoticesResponse{Notices: filtered})
}

func (api *API) listPersistedTelemetryNotices(ctx context.Context, audience string) ([]chroniclesdk.TelemetryNotice, error) {
	method := "ListActivePublicTelemetryNotices"
	if audience == telemetryNoticeAudienceAdmin {
		method = "ListActiveAdminTelemetryNotices"
	}

	// The generated database contract lands separately. Keeping reflection in this
	// adapter lets this change compile before that generation, while the handlers
	// and frontend remain coupled only to the stable SDK contract.
	return callTelemetryNoticeList(ctx, database.New(api.Opts.Pool), method)
}

func callTelemetryNoticeList(ctx context.Context, store any, methodName string) ([]chroniclesdk.TelemetryNotice, error) {
	method := reflect.ValueOf(store).MethodByName(methodName)
	if !method.IsValid() {
		return nil, fmt.Errorf("database store does not implement %s", methodName)
	}

	methodType := method.Type()
	if methodType.NumIn() != 1 || !methodType.In(0).Implements(reflect.TypeFor[context.Context]()) || methodType.NumOut() != 2 {
		return nil, fmt.Errorf("database method %s has an unexpected signature", methodName)
	}

	results := method.Call([]reflect.Value{reflect.ValueOf(ctx)})
	if errValue := results[1]; !errValue.IsNil() {
		err, ok := errValue.Interface().(error)
		if !ok {
			return nil, fmt.Errorf("database method %s returned a non-error failure", methodName)
		}
		return nil, err
	}

	rows := results[0]
	if rows.Kind() != reflect.Slice {
		return nil, fmt.Errorf("database method %s returned %s, want slice", methodName, rows.Kind())
	}

	notices := make([]chroniclesdk.TelemetryNotice, 0, rows.Len())
	for i := 0; i < rows.Len(); i++ {
		notice, err := telemetryNoticeFromRow(rows.Index(i))
		if err != nil {
			return nil, fmt.Errorf("convert result %d from %s: %w", i, methodName, err)
		}
		notices = append(notices, notice)
	}
	return notices, nil
}

func telemetryNoticeFromRow(row reflect.Value) (chroniclesdk.TelemetryNotice, error) {
	for row.Kind() == reflect.Pointer {
		if row.IsNil() {
			return chroniclesdk.TelemetryNotice{}, fmt.Errorf("row is nil")
		}
		row = row.Elem()
	}
	if row.Kind() != reflect.Struct {
		return chroniclesdk.TelemetryNotice{}, fmt.Errorf("row is %s, want struct", row.Kind())
	}

	id, err := requiredStringField(row, "ID")
	if err != nil {
		return chroniclesdk.TelemetryNotice{}, err
	}
	audience, err := requiredStringField(row, "Audience")
	if err != nil {
		return chroniclesdk.TelemetryNotice{}, err
	}
	category, err := requiredStringField(row, "Category")
	if err != nil {
		return chroniclesdk.TelemetryNotice{}, err
	}
	severity, err := requiredStringField(row, "Severity")
	if err != nil {
		return chroniclesdk.TelemetryNotice{}, err
	}
	title, err := requiredStringField(row, "Title")
	if err != nil {
		return chroniclesdk.TelemetryNotice{}, err
	}
	message, err := requiredStringField(row, "Message")
	if err != nil {
		return chroniclesdk.TelemetryNotice{}, err
	}
	updatedAt, err := requiredTimestamptzField(row, "UpdatedAt")
	if err != nil {
		return chroniclesdk.TelemetryNotice{}, err
	}

	return chroniclesdk.TelemetryNotice{
		ID:          id,
		Audience:    audience,
		Category:    category,
		Severity:    chroniclesdk.TelemetryNoticeSeverity(severity),
		Title:       title,
		Message:     message,
		ActionLabel: optionalTextField(row, "ActionLabel"),
		ActionURL:   optionalTextField(row, "ActionUrl"),
		StartsAt:    optionalTimestamptzField(row, "StartsAt"),
		ExpiresAt:   optionalTimestamptzField(row, "ExpiresAt"),
		UpdatedAt:   updatedAt,
	}, nil
}

func requiredStringField(row reflect.Value, name string) (string, error) {
	field := row.FieldByName(name)
	if !field.IsValid() || field.Kind() != reflect.String {
		return "", fmt.Errorf("missing string field %s", name)
	}
	return field.String(), nil
}

func optionalTextField(row reflect.Value, name string) *string {
	field := row.FieldByName(name)
	if !field.IsValid() || !field.CanInterface() {
		return nil
	}
	value, ok := field.Interface().(pgtype.Text)
	if !ok || !value.Valid {
		return nil
	}
	return &value.String
}

func optionalTimestamptzField(row reflect.Value, name string) *time.Time {
	field := row.FieldByName(name)
	if !field.IsValid() || !field.CanInterface() {
		return nil
	}
	value, ok := field.Interface().(pgtype.Timestamptz)
	if !ok || !value.Valid {
		return nil
	}
	return &value.Time
}

func requiredTimestamptzField(row reflect.Value, name string) (time.Time, error) {
	value := optionalTimestamptzField(row, name)
	if value == nil {
		return time.Time{}, fmt.Errorf("missing valid timestamptz field %s", name)
	}
	return *value, nil
}
