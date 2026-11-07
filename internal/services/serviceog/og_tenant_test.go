package serviceog

import (
	"context"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// ctxRecordingStore serves one instance and records the tenant and
// cancellation state of every lookup's context. servicetenant.PrepareConn
// scopes a pool connection from exactly that context.
type ctxRecordingStore struct {
	database.Store
	inst database.LogInstancesGuild

	mu      sync.Mutex
	tenants map[string]uuid.UUID
	errs    map[string]error
}

func (s *ctxRecordingStore) record(ctx context.Context, name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tenants[name] = servicetenant.TenantIDFromContext(ctx)
	s.errs[name] = ctx.Err()
}

func (s *ctxRecordingStore) PublicInstance(ctx context.Context, _ uuid.UUID) (database.LogInstancesGuild, error) {
	s.record(ctx, "PublicInstance")
	return s.inst, nil
}

func (s *ctxRecordingStore) PublicInstanceBySlug(ctx context.Context, _ pgtype.Text) (database.LogInstancesGuild, error) {
	s.record(ctx, "PublicInstanceBySlug")
	return s.inst, nil
}

func (s *ctxRecordingStore) GetSharedViewByCode(ctx context.Context, _ string) (database.SharedView, error) {
	s.record(ctx, "GetSharedViewByCode")
	return database.SharedView{InstanceID: uuid.NullUUID{UUID: s.inst.ID, Valid: true}}, nil
}

func (s *ctxRecordingStore) EncountersByInstanceID(ctx context.Context, _ uuid.UUID) ([]database.LogInstanceEncounter, error) {
	s.record(ctx, "EncountersByInstanceID")
	return nil, nil
}

func (s *ctxRecordingStore) InstancePlayersByInstanceID(ctx context.Context, _ uuid.UUID) ([]database.LogInstancePlayer, error) {
	s.record(ctx, "InstancePlayersByInstanceID")
	return nil, nil
}

// TestInstanceAndShareOGRequestContext checks that the instance page and share
// link OG lookups run on the request's context, so the tenant reaches RLS and
// a cancelled request stops them.
func TestInstanceAndShareOGRequestContext(t *testing.T) {
	t.Parallel()
	inst := database.LogInstancesGuild{ID: uuid.New(), Name: "Molten Core"}

	cases := map[string]struct {
		resolve func(*Service, context.Context) bool
		lookups []string
	}{
		"instance by id": {
			resolve: func(s *Service, ctx context.Context) bool {
				r := httptest.NewRequestWithContext(ctx, "GET", "/instances/"+inst.ID.String(), nil)
				return s.instanceOG(r, "og.test", inst.ID.String()) != nil
			},
			lookups: []string{"PublicInstance", "EncountersByInstanceID", "InstancePlayersByInstanceID"},
		},
		"instance by slug": {
			resolve: func(s *Service, ctx context.Context) bool {
				r := httptest.NewRequestWithContext(ctx, "GET", "/instances/slug", nil)
				return s.instanceOG(r, "og.test", "slug") != nil
			},
			lookups: []string{"PublicInstanceBySlug", "EncountersByInstanceID", "InstancePlayersByInstanceID"},
		},
		"share link": {
			resolve: func(s *Service, ctx context.Context) bool {
				r := httptest.NewRequestWithContext(ctx, "GET", "/s/code", nil)
				return s.shareOG(r, "og.test", "code") != nil
			},
			lookups: []string{"GetSharedViewByCode", "PublicInstance", "EncountersByInstanceID", "InstancePlayersByInstanceID"},
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			newService := func() (*Service, *ctxRecordingStore) {
				store := &ctxRecordingStore{inst: inst, tenants: map[string]uuid.UUID{}, errs: map[string]error{}}
				return New(Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), store)}), store
			}

			tenantID := uuid.New()
			svc, store := newService()
			require.True(t, tc.resolve(svc, servicetenant.WithTenantID(testutil.Context(t, testutil.WaitShort), tenantID)))
			for _, lookup := range tc.lookups {
				require.Equal(t, tenantID, store.tenants[lookup], "%s must run under the request's tenant", lookup)
			}

			ctx, cancel := context.WithCancel(testutil.Context(t, testutil.WaitShort))
			cancel()
			svc, store = newService()
			tc.resolve(svc, ctx)
			for _, lookup := range tc.lookups {
				require.ErrorIs(t, store.errs[lookup], context.Canceled, "%s must see the request's cancellation", lookup)
			}
		})
	}
}
