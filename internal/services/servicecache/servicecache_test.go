package servicecache

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestInvalidationRouting(t *testing.T) {
	t.Parallel()

	svc := New(nil)
	datasetID := uuid.New()
	otherDatasetID := uuid.New()
	var calls []string

	require.NoError(t, svc.RegisterInvalidator(NamespaceItems, ScopeDataset, "first", func(_ context.Context, req Invalidation) error {
		require.Equal(t, datasetID, req.DatasetID)
		calls = append(calls, "first")
		return nil
	}))
	require.NoError(t, svc.RegisterInvalidator(NamespaceItems, ScopeDataset, "second", func(_ context.Context, req Invalidation) error {
		require.NotEqual(t, otherDatasetID, req.DatasetID)
		calls = append(calls, "second")
		return nil
	}))
	require.NoError(t, svc.RegisterInvalidator(NamespaceCreatures, ScopeDataset, "creatures", func(context.Context, Invalidation) error {
		calls = append(calls, "wrong_namespace")
		return nil
	}))

	require.NoError(t, svc.Invalidate(context.Background(), DatasetInvalidation(NamespaceItems, datasetID)))
	require.Equal(t, []string{"first", "second"}, calls)
}

func TestInvalidationRegistrationAndErrors(t *testing.T) {
	t.Parallel()

	svc := New(nil)
	handler := func(context.Context, Invalidation) error { return nil }
	require.NoError(t, svc.RegisterInvalidator(NamespaceTenantSlugs, ScopeGlobal, "reload", handler))

	err := svc.RegisterInvalidator(Namespace("missing"), ScopeGlobal, "missing", handler)
	require.ErrorIs(t, err, ErrUnknownNamespace)

	err = svc.RegisterInvalidator(NamespaceTenantSlugs, ScopeGlobal, "reload", handler)
	require.ErrorIs(t, err, ErrDuplicateInvalidator)

	err = svc.Invalidate(context.Background(), GlobalInvalidation(Namespace("missing")))
	require.ErrorIs(t, err, ErrUnknownNamespace)

	err = svc.Invalidate(context.Background(), DatasetInvalidation(NamespaceTenantSlugs, uuid.New()))
	require.ErrorIs(t, err, ErrUnsupportedScope)
}

func TestInvalidationRunsAllHandlersAfterError(t *testing.T) {
	t.Parallel()

	svc := New(nil)
	sentinel := errors.New("reload failed")
	called := false
	require.NoError(t, svc.RegisterInvalidator(NamespaceTenantSlugs, ScopeGlobal, "failing", func(context.Context, Invalidation) error {
		return sentinel
	}))
	require.NoError(t, svc.RegisterInvalidator(NamespaceTenantSlugs, ScopeGlobal, "following", func(context.Context, Invalidation) error {
		called = true
		return nil
	}))

	err := svc.Invalidate(context.Background(), GlobalInvalidation(NamespaceTenantSlugs))
	require.ErrorIs(t, err, sentinel)
	require.True(t, called)
}
