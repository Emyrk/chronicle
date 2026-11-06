package api

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type configurationStore struct {
	dataset     database.Dataset
	requestedID uuid.UUID
	flavors     []string
	rows        []database.ResolveLeaderboardConfigurationRow
	err         error
}

func (s *configurationStore) GetDataset(_ context.Context, id uuid.UUID) (database.Dataset, error) {
	s.requestedID = id
	return s.dataset, s.err
}
func (s *configurationStore) ListLeaderboardLayers(context.Context) ([]database.LeaderboardLayer, error) {
	return []database.LeaderboardLayer{{Key: "base", RequiredFlavors: []string{"vanilla"}}, {Key: "plus", RequiredFlavors: []string{"vanilla", "vanillaplus"}}, {Key: "server", RequiredFlavors: []string{"turtle"}}, {Key: "wrath", RequiredFlavors: []string{"wrath"}}}, nil
}
func (s *configurationStore) ResolveLeaderboardConfiguration(_ context.Context, flavors []string) ([]database.ResolveLeaderboardConfigurationRow, error) {
	s.flavors = flavors
	return s.rows, nil
}

func TestInspectLeaderboardConfiguration(t *testing.T) {
	t.Parallel()
	for _, tenantDataset := range []bool{false, true} {
		t.Run(map[bool]string{false: "default dataset", true: "tenant dataset"}[tenantDataset], func(t *testing.T) {
			t.Parallel()
			id := uuid.New()
			tenant := database.Tenant{ID: uuid.New(), Name: "Test tenant", AdditionalFlavor: []string{"vanillaplus", "vanilla", "turtle"}, DefaultDatasetID: uuid.NullUUID{UUID: id, Valid: tenantDataset}}
			store := &configurationStore{dataset: database.Dataset{Name: "Dataset", DefaultFlavor: []string{"vanilla", "turtle"}}, rows: []database.ResolveLeaderboardConfigurationRow{{Kind: "boss", HasPoints: true, Points: 0}, {Kind: "boss", HasPoints: false}, {Kind: "set", SetName: "Full clear"}}}
			result, err := inspectLeaderboardConfiguration(context.Background(), store, &tenant)
			require.NoError(t, err)
			expected := servicedataset.DefaultDatasetID
			if tenantDataset {
				expected = id
			}
			require.Equal(t, expected, store.requestedID)
			require.Equal(t, &tenant.ID, result.TenantID)
			require.ElementsMatch(t, []string{"vanilla", "turtle", "vanillaplus"}, result.EffectiveFlavor)
			require.ElementsMatch(t, []string{"vanilla", "vanillaplus"}, store.flavors)
			require.Equal(t, store.flavors, result.LeaderboardFlavor)
			require.Len(t, result.Layers, 2)
			require.True(t, result.Rows[0].HasPoints)
			require.Zero(t, result.Rows[0].Points)
			require.False(t, result.Rows[1].HasPoints)
			require.Equal(t, "Full clear", result.Rows[2].SetName)
		})
	}
}

func TestInspectLeaderboardConfigurationStates(t *testing.T) {
	t.Parallel()
	t.Run("root empty", func(t *testing.T) {
		t.Parallel()
		store := &configurationStore{}
		result, err := inspectLeaderboardConfiguration(context.Background(), store, nil)
		require.NoError(t, err)
		require.Nil(t, result.TenantID)
		require.Equal(t, servicedataset.DefaultDatasetID, store.requestedID)
		require.NotNil(t, result.Rows)
		require.Empty(t, result.Rows)
	})
	t.Run("conflict never partial", func(t *testing.T) {
		t.Parallel()
		store := &configurationStore{rows: []database.ResolveLeaderboardConfigurationRow{{Kind: "instance", InstanceName: "Hidden"}, {Kind: "conflict", EncounterName: "boss/Test", ConflictingProperty: "points"}}}
		result, err := inspectLeaderboardConfiguration(context.Background(), store, nil)
		require.NoError(t, err)
		require.Contains(t, result.Conflict, "boss/Test")
		require.Empty(t, result.Rows)
	})
	t.Run("dataset failure is not fallback", func(t *testing.T) {
		t.Parallel()
		store := &configurationStore{err: errors.New("dataset unavailable")}
		_, err := inspectLeaderboardConfiguration(context.Background(), store, nil)
		require.ErrorContains(t, err, "dataset unavailable")
	})
}

func TestSelectableConfigurationTenants(t *testing.T) {
	t.Parallel()
	public := database.Tenant{ID: uuid.New(), Name: "Public", Discoverable: true, Branding: []byte(`{"square_logo":"/logo.png","display_name":"Public Realm"}`)}
	hidden := database.Tenant{ID: uuid.New(), Name: "Hidden"}
	tenants := []database.Tenant{public, hidden}

	require.Equal(t, []database.Tenant{public}, selectableConfigurationTenants(tenants, false))
	require.Equal(t, tenants, selectableConfigurationTenants(tenants, true))

	choice := configurationTenantChoice(public)
	require.Equal(t, "Public Realm", choice.Name)
	require.Equal(t, "/logo.png", choice.SquareLogo)
	require.True(t, choice.Discoverable)
}
