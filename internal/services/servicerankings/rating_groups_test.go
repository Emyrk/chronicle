package servicerankings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type groupCatalogStub struct {
	tenant               uuid.UUID
	group, server, realm uuid.UUID
}

func (s groupCatalogStub) ListRatingRealmGroups(_ context.Context, tenant uuid.UUID) ([]database.RatingRealmGroup, error) {
	if tenant != s.tenant {
		return nil, nil
	}
	return []database.RatingRealmGroup{{ID: s.group, ServerID: s.server, Name: "Phase Two"}}, nil
}
func (s groupCatalogStub) ListRatingRealmGroupMembers(_ context.Context, params database.ListRatingRealmGroupMembersParams) ([]database.ListRatingRealmGroupMembersRow, error) {
	if params.GroupID != s.group || params.TenantID != s.tenant {
		return nil, nil
	}
	return []database.ListRatingRealmGroupMembersRow{{ID: s.realm, Name: "Progression"}}, nil
}
func (s groupCatalogStub) ListRatingBossPolicies(_ context.Context, params database.ListRatingBossPoliciesParams) ([]database.RatingGroupBossPolicy, error) {
	if params.GroupID != s.group || params.TenantID != s.tenant {
		return nil, nil
	}
	return []database.RatingGroupBossPolicy{{GroupID: s.group, InstanceName: "Molten Core", EncounterName: "Ragnaros"}}, nil
}

func TestRatingRealmGroupsResponse(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	stub := groupCatalogStub{tenant: tenant, group: uuid.New(), server: uuid.New(), realm: uuid.New()}
	req := httptest.NewRequest(http.MethodGet, "/ratings/groups", nil)
	req = req.WithContext(servicetenant.WithTenantID(req.Context(), tenant))
	rec := httptest.NewRecorder()
	handleRatingRealmGroupsWithStore(stub, rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var response chroniclesdk.RatingRealmGroupsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Len(t, response.Groups, 1)
	require.Equal(t, stub.group, response.Groups[0].ID)
	require.Equal(t, stub.realm, response.Groups[0].Realms[0].ID)
	require.Equal(t, "Ragnaros", response.Groups[0].EligibleBosses[0].EncounterName)
}
