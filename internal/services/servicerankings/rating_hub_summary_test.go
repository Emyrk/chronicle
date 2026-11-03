package servicerankings

import (
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestParseHubSummaryInput(t *testing.T) {
	t.Parallel()
	realm := uuid.New()
	for _, tt := range []struct {
		name, query  string
		valid, exact bool
		size         int16
		realms       int
	}{
		{"landing", "", true, false, 0, 0},
		{"turtle empty difficulty size zero", "instance_name=Molten+Core&difficulty_name=&max_players=0", true, true, 0, 0},
		{"selected boss and realms", "instance_name=Molten+Core&encounter_name=Ragnaros&difficulty_name=Heroic&max_players=40&realm_ids=" + realm.String() + "," + realm.String(), true, true, 40, 1},
		{"unpaired difficulty", "instance_name=Molten+Core&difficulty_name=", false, false, 0, 0},
		{"unpaired size", "instance_name=Molten+Core&max_players=0", false, false, 0, 0},
		{"negative size", "instance_name=Molten+Core&difficulty_name=&max_players=-1", false, false, 0, 0},
		{"duplicate filter", "instance_name=A&instance_name=B", false, false, 0, 0},
		{"invalid realm", "realm_ids=unknown", false, false, 0, 0},
		{"invalid metric", "instance_name=A&performance_metric=heals", false, false, 0, 0},
		{"unsupported limit", "limit=100000", false, false, 0, 0},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest("GET", "/ratings/hub-summary?"+tt.query, nil)
			got, err := parseHubSummaryInput(request)
			if !tt.valid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.exact, got.exact)
			require.Equal(t, tt.size, got.size)
			require.Len(t, got.realmIDs, tt.realms)
		})
	}
}

func TestEmptyHubRatingBoard(t *testing.T) {
	t.Parallel()
	board := emptyHubBoard()
	require.NotNil(t, board.Player.Peak)
	require.NotNil(t, board.Player.RankedMastery)
	require.NotNil(t, board.Player.Renown)
	require.NotNil(t, board.Guild.Peak)
	require.NotNil(t, board.Guild.RankedMastery)
	require.NotNil(t, board.Guild.Renown)
}
