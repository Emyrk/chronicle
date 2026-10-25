package linkedapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestValidProofCharacters(t *testing.T) {
	t.Parallel()
	realm := uuid.New()
	otherRealm := uuid.New()
	first := chroniclesdk.ProofCharacter{RealmID: realm, CharacterGUID: guid.GUID(1)}
	second := chroniclesdk.ProofCharacter{RealmID: realm, CharacterGUID: guid.GUID(2)}
	for _, test := range []struct {
		name       string
		characters []chroniclesdk.ProofCharacter
		valid      bool
	}{
		{"same realm", []chroniclesdk.ProofCharacter{first, second}, true},
		{"no characters", nil, false},
		{"other realm", []chroniclesdk.ProofCharacter{first, {RealmID: otherRealm, CharacterGUID: guid.GUID(2)}}, false},
		{"duplicate", []chroniclesdk.ProofCharacter{first, first}, false},
		{"missing GUID", []chroniclesdk.ProofCharacter{{RealmID: realm}}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := validProofCharacters(test.characters); got != test.valid {
				t.Errorf("valid=%v, want %v", got, test.valid)
			}
		})
	}
}

func TestProofPermissionScopes(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	h := &Handler{zed: zed}
	tenantA, tenantB := uuid.New(), uuid.New()
	siteSubmitter, siteReviewer, tenantSubmitter, tenantReviewer, userAdmin, tenantAdmin := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteSubmitter, []string{"photo_proof_submitter"}))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteReviewer, []string{"photo_proof_reviewer"}))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userAdmin, []string{"is_admin_users"}))
	require.NoError(t, zed.SetTenantProofGrant(ctx, tenantA, tenantSubmitter, true, false))
	require.NoError(t, zed.SetTenantProofGrant(ctx, tenantA, tenantReviewer, false, true))
	b := policy.New()
	b.Wow_tenant(tenantA).Chronicle(b.GlobalChronicle()).Admin(b.User(tenantAdmin))
	b.Wow_tenant(tenantB).Chronicle(b.GlobalChronicle())
	_, err := zed.Write(ctx, *b.Txn())
	require.NoError(t, err)

	for _, tc := range []struct {
		name   string
		user   uuid.UUID
		tenant uuid.UUID // nil UUID means root domain
		review bool
		want   int
	}{
		{"site submit on tenant A", siteSubmitter, tenantA, false, http.StatusNoContent},
		{"site submit on tenant B", siteSubmitter, tenantB, false, http.StatusNoContent},
		{"site submit on root", siteSubmitter, uuid.Nil, false, http.StatusForbidden},
		{"tenant submit on A", tenantSubmitter, tenantA, false, http.StatusNoContent},
		{"tenant submit on B", tenantSubmitter, tenantB, false, http.StatusForbidden},
		{"site review on root", siteReviewer, uuid.Nil, true, http.StatusNoContent},
		{"site review on A", siteReviewer, tenantA, true, http.StatusNoContent},
		{"site review on B", siteReviewer, tenantB, true, http.StatusNoContent},
		{"tenant review on A", tenantReviewer, tenantA, true, http.StatusNoContent},
		{"tenant review on B", tenantReviewer, tenantB, true, http.StatusForbidden},
		{"tenant review on root", tenantReviewer, uuid.Nil, true, http.StatusForbidden},
		{"user admin on root", userAdmin, uuid.Nil, true, http.StatusNoContent},
		{"user admin on A", userAdmin, tenantA, true, http.StatusForbidden},
		{"tenant admin on A", tenantAdmin, tenantA, true, http.StatusForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			requestCtx := authz.AsUser(ctx, tc.user)
			if tc.tenant != uuid.Nil {
				requestCtx = servicetenant.WithTenantID(requestCtx, tc.tenant)
			}
			req := httptest.NewRequest(http.MethodGet, "/proofs", nil).WithContext(requestCtx)
			rec := httptest.NewRecorder()
			h.proofPermission(tc.review)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			})).ServeHTTP(rec, req)
			require.Equal(t, tc.want, rec.Code)
		})
	}
}
