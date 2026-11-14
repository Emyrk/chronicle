package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/serviceinstancesearch"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
)

func TestSpellSearchAnonymousForbiddenBeforeCharge(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	search := serviceinstancesearch.New(testutil.Logger(t), db, prometheus.NewRegistry(), func(context.Context, uuid.UUID) (serviceinstancesearch.UserAccess, error) {
		return serviceinstancesearch.UserAccess{Limit: ratelimit.Limit{Burst: 100}, Tier: "free"}, nil
	})
	api := &API{instanceSearch: search}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/wowdb/spells/search", strings.NewReader(`{"context":{"level":null,"difficulty":0},"where":{"field":"spell.name","op":"contains","value":"frost"}}`))
	rec := httptest.NewRecorder()

	api.SpellSearch(rec, req)

	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Equal(t, servicedataset.DefaultDatasetID.String(), rec.Header().Get("X-Chronicle-Dataset"))
	require.Equal(t, "2", rec.Header().Get(InstanceSearchCostHeader))
	status, _, err := search.Peek(testutil.Context(t, testutil.WaitShort), serviceinstancesearch.Caller{IP: "192.0.2.1"})
	require.NoError(t, err)
	require.Equal(t, 40.0, status.Remaining)
}

func TestSpellSearchRejectsMalformedDataset(t *testing.T) {
	t.Parallel()
	api := &API{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/wowdb/spells/search?dataset_id=nope", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()

	api.SpellSearch(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "Invalid dataset_id")
}

func TestSpellSearchRejectsOversizedBody(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	search := serviceinstancesearch.New(testutil.Logger(t), db, prometheus.NewRegistry(), nil)
	api := &API{instanceSearch: search}
	body := `{ "context": { "level": null, "difficulty": 0 } }` + strings.Repeat(" ", spellSearchMaxBody)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/wowdb/spells/search", strings.NewReader(body))
	rec := httptest.NewRecorder()

	api.SpellSearch(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "request body too large")
}
