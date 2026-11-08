package serviceog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

type requestContextStore struct {
	database.Store
	gotTenant uuid.UUID
	gotErr    error
}

func (s *requestContextStore) capture(ctx context.Context) {
	s.gotTenant = servicetenant.TenantIDFromContext(ctx)
	s.gotErr = ctx.Err()
}

func (s *requestContextStore) PublicInstance(ctx context.Context, _ uuid.UUID) (database.LogInstancesGuild, error) {
	s.capture(ctx)
	return database.LogInstancesGuild{}, context.Canceled
}

func (s *requestContextStore) GetSharedViewByCode(ctx context.Context, _ string) (database.SharedView, error) {
	s.capture(ctx)
	return database.SharedView{}, context.Canceled
}

func TestInstanceAndShareOGUseRequestContext(t *testing.T) {
	t.Parallel()

	cases := map[string]func(*Service, *http.Request){
		"instance": func(s *Service, r *http.Request) {
			s.instanceOG(r, "og.test", uuid.NewString())
		},
		"share": func(s *Service, r *http.Request) {
			s.shareOG(r, "og.test", "code")
		},
	}

	for name, resolve := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			tenantID := uuid.New()
			ctx, cancel := context.WithCancel(servicetenant.WithTenantID(context.Background(), tenantID))
			cancel()

			store := &requestContextStore{}
			svc := New(Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), store)})
			resolve(svc, httptest.NewRequestWithContext(ctx, http.MethodGet, "/", nil))

			require.Equal(t, tenantID, store.gotTenant)
			require.ErrorIs(t, store.gotErr, context.Canceled)
		})
	}
}
