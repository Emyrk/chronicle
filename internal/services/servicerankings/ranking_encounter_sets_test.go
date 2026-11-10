package servicerankings

import (
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestResolveRankingEncounterNames(t *testing.T) {
	t.Parallel()

	service := &Service{registry: registry.RegistryForFlavor(nil, database.WoWFlavor{database.FlavorWrath})}

	for _, tt := range []struct {
		name       string
		query      string
		want       []string
		wantOK     bool
		wantStatus int
	}{
		{
			name:   "default empty ID",
			query:  "instance_names=Obsidian+Sanctum&encounter_set=",
			want:   []string{"Sartharion"},
			wantOK: true,
		},
		{
			name:   "named set",
			query:  "instance_names=Obsidian+Sanctum&encounter_set=3d",
			want:   []string{"Sartharion (3 Drakes)"},
			wantOK: true,
		},
		{
			name:   "explicit encounters take precedence",
			query:  "instance_names=Obsidian+Sanctum&encounter_set=3d&encounter_names=Sartharion",
			want:   []string{"Sartharion"},
			wantOK: true,
		},
		{
			name:       "unknown set",
			query:      "instance_names=Obsidian+Sanctum&encounter_set=missing",
			wantOK:     false,
			wantStatus: 400,
		},
		{
			name:       "set requires one instance",
			query:      "instance_names=Obsidian+Sanctum,Naxxramas&encounter_set=",
			wantOK:     false,
			wantStatus: 400,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			request := httptest.NewRequest("GET", "/?"+tt.query, nil)
			recorder := httptest.NewRecorder()
			got, ok := service.resolveRankingEncounterNames(recorder, request)

			require.Equal(t, tt.wantOK, ok)
			require.Equal(t, tt.want, got)
			if tt.wantStatus != 0 {
				require.Equal(t, tt.wantStatus, recorder.Code)
			}
		})
	}
}
