package tenant_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/tenant"
)

func TestResolve(t *testing.T) {
	t.Parallel()
	def := tenant.Known[0]
	require.Equal(t, def, tenant.Resolve(tenant.Tenant{}, ""))
	custom := tenant.Resolve(tenant.Tenant{}, "https://x.example/")
	require.Equal(t, "https://x.example", custom.BaseURL)
	require.Equal(t, def.Format, custom.Format)
	// A saved tenant sticks without flags.
	require.Equal(t, custom, tenant.Resolve(custom, ""))
}
