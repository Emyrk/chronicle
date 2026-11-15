package servicestats

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

func censusRowOf(class database.WowPlayableClass, race database.WowPlayableRace, faction string, n int64) database.StatsCensusCountsRow {
	row := database.StatsCensusCountsRow{Class: class, Race: race, Count: n}
	if faction != "" {
		row.Faction = database.NullWowPlayerFaction{WowPlayerFaction: database.WowPlayerFaction(faction), Valid: true}
	}
	return row
}

func TestBuildCensusWindow(t *testing.T) {
	t.Parallel()

	rows := []database.StatsCensusCountsRow{
		censusRowOf(database.WowPlayableClassWARRIOR, database.WowPlayableRaceOrc, "", 30),
		censusRowOf(database.WowPlayableClassWARRIOR, database.WowPlayableRaceHuman, "Alliance", 20),
		censusRowOf(database.WowPlayableClassMAGE, database.WowPlayableRaceScourge, "", 40),
		censusRowOf(database.WowPlayableClassDEATHKNIGHT, database.WowPlayableRaceNightElf, "", 5),
		censusRowOf(database.WowPlayableClassUNKNOWN, database.WowPlayableRaceUnknown, "", 7),
		censusRowOf(database.WowPlayableClassMAGE, database.WowPlayableRaceSkyborne, "", 3),
	}
	w := buildCensusWindow(rows, 30, nil)

	require.Equal(t, 30, w.Days)
	require.EqualValues(t, 105, w.Total, "every character, including unknown class and race")
	require.Equal(t, []censusRow{
		{Name: "Warrior", Alliance: 20, Horde: 30},
		{Name: "Mage", Horde: 40, Unknown: 3},
		{Name: "Death Knight", Alliance: 5},
		{Name: "Unknown", Unknown: 7},
	}, w.Classes, "largest first, Unknown last")
	names := make([]string, len(w.Races))
	for i, r := range w.Races {
		names[i] = r.Name
	}
	require.Equal(t, []string{"Undead", "Orc", "Human", "Night Elf", "Skyborne", "Unknown"}, names)
}

func TestCensusFactionAndNames(t *testing.T) {
	t.Parallel()

	none := database.NullWowPlayerFaction{}
	horde := database.NullWowPlayerFaction{WowPlayerFaction: database.WowPlayerFactionHorde, Valid: true}
	ursol := database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol}

	require.Equal(t, "Horde", censusFaction(database.WowPlayableRaceTroll, none, nil))
	require.Equal(t, "Alliance", censusFaction(database.WowPlayableRaceDwarf, none, nil))
	require.Equal(t, "Horde", censusFaction(database.WowPlayableRaceBloodElf, none, nil))
	require.Equal(t, "Alliance", censusFaction(database.WowPlayableRaceBloodElf, none, ursol), "Blood Elves are the Alliance High Elf on Ursol servers")
	require.Equal(t, "Unknown", censusFaction(database.WowPlayableRaceSkyborne, none, nil))
	require.Equal(t, "Horde", censusFaction(database.WowPlayableRaceHuman, horde, nil), "the observed faction wins")

	require.Equal(t, "Blood Elf", censusRaceName(database.WowPlayableRaceBloodElf, nil))
	require.Equal(t, "High Elf", censusRaceName(database.WowPlayableRaceBloodElf, ursol))
	require.Equal(t, "Undead", censusRaceName(database.WowPlayableRaceScourge, nil))
	require.Equal(t, "Night Elf", censusRaceName(database.WowPlayableRaceNightElf, nil))
	require.Equal(t, "Death Knight", censusClassName(database.WowPlayableClassDEATHKNIGHT))
	require.Equal(t, "Mage", censusClassName(database.WowPlayableClassMAGE))
	require.Equal(t, "Unknown", censusClassName(database.WowPlayableClassUNKNOWN))
}

func TestPercent(t *testing.T) {
	t.Parallel()
	require.Equal(t, "14.2%", percent(142, 1000))
	require.Equal(t, "100.0%", percent(5, 5))
	require.Equal(t, "0.0%", percent(0, 0), "no division by zero")
}

// censusStore answers the census query, keyed by how far back the window starts.
type censusStore struct {
	database.Store
	rows map[int][]database.StatsCensusCountsRow // by window days
	now  time.Time
}

func (s censusStore) StatsCensusCounts(_ context.Context, since pgtype.Timestamptz) ([]database.StatsCensusCountsRow, error) {
	days := int(s.now.Sub(since.Time).Round(24*time.Hour) / (24 * time.Hour))
	return s.rows[days], nil
}

func TestCensusProducer(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := censusStore{now: time.Now(), rows: map[int][]database.StatsCensusCountsRow{
		30: {censusRowOf(database.WowPlayableClassMAGE, database.WowPlayableRaceHuman, "", 120)},
		90: {
			censusRowOf(database.WowPlayableClassMAGE, database.WowPlayableRaceHuman, "", 120),
			censusRowOf(database.WowPlayableClassROGUE, database.WowPlayableRaceOrc, "", 80),
		},
	}}

	out, err := censusProducer{}.Compute(ctx, Tenant{Store: store})
	require.NoError(t, err)
	require.Len(t, out, 1)
	require.Equal(t, "census", out[0].Key)
	require.Equal(t, 120, out[0].SampleN, "the sample is the 30-day character count")
	require.Equal(t, censusMinSample, out[0].MinSample)
	payload := out[0].Payload.(censusPayload)
	require.Len(t, payload.Windows, 2)
	require.EqualValues(t, 120, payload.Windows[0].Total)
	require.EqualValues(t, 200, payload.Windows[1].Total)

	// No characters in the last 30 days: no page, rather than an empty one.
	out, err = censusProducer{}.Compute(ctx, Tenant{Store: censusStore{now: time.Now(), rows: map[int][]database.StatsCensusCountsRow{90: store.rows[90]}}})
	require.NoError(t, err)
	require.Empty(t, out)
}
