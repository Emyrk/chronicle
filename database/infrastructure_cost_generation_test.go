package database_test

import (
	"context"
	"github.com/Emyrk/chronicle/internal/infrastructurecosts"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

type fixedCostProvider struct{ start, end time.Time }

func (f fixedCostProvider) PreviousPeriod(context.Context) (time.Time, time.Time, error) {
	return f.start, f.end, nil
}
func (f fixedCostProvider) Fetch(context.Context, time.Time, time.Time) (infrastructurecosts.ProviderUsage, []byte, error) {
	return infrastructurecosts.ProviderUsage{ProjectName: "test", Costs: infrastructurecosts.CategoryCosts{CPUMicrodollars: 10}}, []byte(`{"data":"fixture"}`), nil
}

type invalidPayloadCostProvider struct{ fixedCostProvider }

func (p invalidPayloadCostProvider) Fetch(context.Context, time.Time, time.Time) (infrastructurecosts.ProviderUsage, []byte, error) {
	return infrastructurecosts.ProviderUsage{ProjectName: "test"}, []byte(`not-json`), nil
}

func TestInfrastructureCostGenerationRollsBackInvalidProviderPayload(t *testing.T) {
	t.Parallel()
	_, store, _ := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	svc := infrastructurecosts.Service{Store: store, Provider: invalidPayloadCostProvider{fixedCostProvider{start, start.AddDate(0, 1, 0)}}, ServerType: "test"}
	_, inserted, err := svc.Generate(ctx, infrastructurecosts.GenerateOptions{})
	require.Error(t, err)
	require.False(t, inserted)
	count, countErr := store.CountInfrastructureCostReports(ctx)
	require.NoError(t, countErr)
	require.Zero(t, count)
}

func TestInfrastructureCostGenerationIdempotencyAndForceRevision(t *testing.T) {
	t.Parallel()
	_, store, _ := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	svc := infrastructurecosts.Service{Store: store, Provider: fixedCostProvider{start, start.AddDate(0, 1, 0)}, ServerType: "test"}
	first, inserted, err := svc.Generate(ctx, infrastructurecosts.GenerateOptions{})
	require.NoError(t, err)
	require.True(t, inserted)
	require.Equal(t, int32(1), first.Revision)
	duplicate, inserted, err := svc.Generate(ctx, infrastructurecosts.GenerateOptions{})
	require.NoError(t, err)
	require.False(t, inserted)
	require.Equal(t, first.ID, duplicate.ID)
	forced, inserted, err := svc.Generate(ctx, infrastructurecosts.GenerateOptions{Force: true})
	require.NoError(t, err)
	require.True(t, inserted)
	require.Equal(t, int32(2), forced.Revision)
	require.NotEqual(t, first.ID, forced.ID)
	count, err := store.CountInfrastructureCostReports(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)
}
