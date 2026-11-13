package serviceeventrepair

import (
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestSelectionBounds(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	for _, limit := range []int{-1, 0, 1001} {
		_, err := validateSelection(CreateRequest{Operation: OperationRazorgore, TenantID: tenant, Limit: limit})
		require.ErrorIs(t, err, ErrInvalid)
	}
	for _, limit := range []int{1, 25, 1000} {
		_, err := validateSelection(CreateRequest{Operation: OperationRazorgore, TenantID: tenant, Limit: limit})
		require.NoError(t, err)
	}
	_, err := validateSelection(CreateRequest{Operation: OperationRazorgore, Limit: 25})
	require.ErrorIs(t, err, ErrInvalid)
	r, err := validateSelection(CreateRequest{Operation: OperationRazorgore, Instance: "https://example.com/instances/a-slug?tab=events"})
	require.NoError(t, err)
	require.Equal(t, "a-slug", r.Instance)
	_, err = validateSelection(CreateRequest{Operation: OperationRazorgore, Instance: "slug", Limit: 2})
	require.ErrorIs(t, err, ErrInvalid)
	_, err = validateSelection(CreateRequest{Operation: "unknown", Instance: "slug"})
	require.ErrorIs(t, err, ErrInvalid)
}
