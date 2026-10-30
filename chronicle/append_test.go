package chronicle

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestUserLogAppendQuotaError(t *testing.T) {
	t.Parallel()
	owner := database.ChronicleUser{ConsumedStorageBytes: 80, MaxStorageBytes: 100}

	require.NoError(t, userLogAppendQuotaError(owner, 20))
	err := userLogAppendQuotaError(owner, 21)
	require.ErrorContains(t, err, "storage limit exceeded")
}
