package registry

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestWorldInstanceFactoryUsesMapIDFallback(t *testing.T) {
	t.Parallel()

	factory := worldInstanceFactory(
		database.WorldInstanceTemplate{
			Name:  "Shadowfang Keep",
			MapID: pgtype.Int4{Int32: 33, Valid: true},
		},
		[]database.WorldInstanceZoneName{{ZoneName: "shadowfang keep", DisplayName: "Shadowfang Keep"}},
		[]database.ListWorldInstanceUnitsRow{{
			EntryID:       4275,
			Affiliation:   database.UnitAffiliationHostile,
			Boss:          true,
			EncounterName: pgtype.Text{String: "Archmage Arugal", Valid: true},
		}},
	)

	require.True(t, factory.MatchZone(zone.Zone{Name: "unmatched", MapID: 33}))
	require.False(t, factory.MatchZone(zone.Zone{Name: "unmatched", MapID: 34}))
	ident := factory.Hostiles().HostileEntries()
	require.True(t, ident[4275].Boss)
	require.Equal(t, "Archmage Arugal", ident[4275].EncounterName)
}
