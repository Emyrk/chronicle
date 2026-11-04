package serviceinstancesearch

import (
	"context"
	"errors"

	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
	"github.com/coder/serpent"
	"github.com/google/uuid"
)

// Runtime owns the one search service shared by the web endpoint and agent tools.
type Runtime struct {
	broker *services.Services
	search *Service
}

var _ services.Servicer = (*Runtime)(nil)

func NewRuntime(broker *services.Services) *Runtime { return &Runtime{broker: broker} }
func SearchService(broker *services.Services) *Service {
	return services.MustGet[*Runtime](broker).search
}
func OnSearch() string                       { return (&Runtime{}).Name() }
func (*Runtime) Name() string                { return "instance_search" }
func (*Runtime) Configures() []string        { return nil }
func (*Runtime) Options() serpent.OptionSet  { return nil }
func (*Runtime) Close(context.Context) error { return nil }
func (*Runtime) DependsOn() []string {
	return []string{servicelogger.OnLogger(), servicedbstore.OnDatabaseStore(), serviceprometheus.OnPrometheus(), serviceauthz.OnAuthz()}
}
func (r *Runtime) Start(context.Context) error {
	zed := serviceauthz.Authz(r.broker)
	resolver := func(ctx context.Context, user uuid.UUID) (UserAccess, error) {
		actor := policy.New().User(user)
		chronicle := policy.New().GlobalChronicle()
		permissions, err := zed.Check(ctx, nil, chronicle.CanHas_exalted_User(actor), chronicle.CanHas_revered_User(actor), chronicle.CanHas_honored_User(actor))
		if err != nil {
			return UserAccess{}, err
		}
		if len(permissions) != 3 {
			return UserAccess{}, errors.New("check instance search supporter tier: expected 3 permission results")
		}
		tier := "free"
		switch {
		case permissions[0]:
			tier = billing.TierExalted
		case permissions[1]:
			tier = billing.TierRevered
		case permissions[2]:
			tier = billing.TierHonored
		}
		return AccessForTier(tier), nil
	}
	r.search = New(servicelogger.Logger(r.broker), servicedbstore.DatabaseStore(r.broker), serviceprometheus.Registry(r.broker), resolver)
	return nil
}
