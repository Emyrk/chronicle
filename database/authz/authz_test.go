package authz_test

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestAuthz(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	logger, authz := servicelogger.Logger(broker), serviceauthz.Authz(broker)

	var _, _, _ = logger, authz, ctx

}

func TestManageConsumablesRole(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)

	for _, tc := range []struct {
		name  string
		roles []string
	}{
		{name: "dedicated role", roles: []string{"manage_consumables"}},
		{name: "admin", roles: []string{"admin"}},
		{name: "technical admin", roles: []string{"technical_admin"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			userID := uuid.New()
			require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, tc.roles))

			canManage, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_consumables_User(policy.New().User(userID)))
			require.NoError(t, err)
			require.True(t, canManage)
		})
	}

	dedicatedUserID := uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(ctx, dedicatedUserID, []string{"manage_consumables"}))
	canManageWorldData, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_world_data_User(policy.New().User(dedicatedUserID)))
	require.NoError(t, err)
	require.False(t, canManageWorldData)
}

func TestInTx_NilWrapped(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)

	// Use an already-cancelled context so BeginTx fails before the
	// callback is invoked, leaving wrapped == nil in the error path.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := zed.InTx(ctx, func(_ *authz.AuthzTX) error {
		t.Fatal("callback should not be invoked on a cancelled context")
		return nil
	}, nil)
	assert.Error(t, err, "InTx should return an error, not panic")
}
