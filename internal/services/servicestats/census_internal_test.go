package servicestats

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

func censusRowOf(class database.WowPlayableClass, race database.WowPlayableRace, faction string, n int64) censusCount {
	row := censusCount{Class: class, Race: race, Count: n}
	if faction != "" {
		row.Faction = database.NullWowPlayerFaction{WowPlayerFaction: database.WowPlayerFaction(faction), Valid: true}
	}
	return row
}

func TestBuildCensusWindow(t *testing.T) {
	t.Parallel()

	rows := []censusCount{
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

// censusStore answers the one census query and records its cutoffs.
type censusStore struct {
	database.Store
	rows   []database.StatsCensusCountsRow
	params []database.StatsCensusCountsParams
}

func (s *censusStore) StatsCensusCounts(_ context.Context, arg database.StatsCensusCountsParams) ([]database.StatsCensusCountsRow, error) {
	s.params = append(s.params, arg)
	return s.rows, nil
}

func countsRow(class database.WowPlayableClass, race database.WowPlayableRace, recent, long int64) database.StatsCensusCountsRow {
	return database.StatsCensusCountsRow{Class: class, Race: race, CountRecent: recent, CountLong: long}
}

func TestCensusProducer(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := &censusStore{rows: []database.StatsCensusCountsRow{
		countsRow(database.WowPlayableClassMAGE, database.WowPlayableRaceHuman, 120, 120),
		countsRow(database.WowPlayableClassROGUE, database.WowPlayableRaceOrc, 0, 80), // only in the long window
	}}
	noon := time.Date(2026, 11, 14, 12, 34, 56, 0, time.UTC)

	out, err := censusProducer{now: func() time.Time { return noon }}.Compute(ctx, Tenant{Store: store})
	require.NoError(t, err)
	require.Len(t, store.params, 1, "both windows come from one query")
	require.Len(t, out, 1)
	require.Equal(t, "census", out[0].Key)
	require.Equal(t, 120, out[0].SampleN, "the sample is the 30-day character count")
	require.Equal(t, censusMinSample, out[0].MinSample)
	payload := out[0].Payload.(censusPayload)
	require.Len(t, payload.Windows, 2)
	require.EqualValues(t, 120, payload.Windows[0].Total)
	require.EqualValues(t, 200, payload.Windows[1].Total)
	require.Equal(t, []censusRow{{Name: "Mage", Alliance: 120}}, payload.Windows[0].Classes, "the rogue was not seen in the 30 days")

	// The cutoffs sit on UTC day boundaries.
	require.Equal(t, time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), store.params[0].SinceRecent.Time)
	require.Equal(t, time.Date(2026, 8, 16, 0, 0, 0, 0, time.UTC), store.params[0].SinceLong.Time)

	// No characters in the last 30 days: no page, rather than an empty one.
	empty := &censusStore{rows: []database.StatsCensusCountsRow{countsRow(database.WowPlayableClassROGUE, database.WowPlayableRaceOrc, 0, 80)}}
	out, err = censusProducer{}.Compute(ctx, Tenant{Store: empty})
	require.NoError(t, err)
	require.Empty(t, out)
}

// The window is quantized to the day, so recomputing through a day with the same
// counts yields the same payload: payload_changed_at, the sitemap lastmod and
// IndexNow move only when counts really change.
func TestCensusPayloadStableWithinADay(t *testing.T) {
	t.Parallel()

	store := &censusStore{rows: []database.StatsCensusCountsRow{
		countsRow(database.WowPlayableClassMAGE, database.WowPlayableRaceHuman, 120, 150),
	}}
	payloadAt := func(now time.Time) string {
		out, err := censusProducer{now: func() time.Time { return now }}.Compute(context.Background(), Tenant{Store: store})
		require.NoError(t, err)
		raw, err := json.Marshal(out[0].Payload)
		require.NoError(t, err)
		return string(raw)
	}
	day := time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC)
	require.Equal(t, payloadAt(day.Add(time.Minute)), payloadAt(day.Add(23*time.Hour+59*time.Minute)))

	// The cutoff moves at midnight, and only then.
	cutoff := func(now time.Time) time.Time { return censusCutoff(now, 30) }
	require.Equal(t, cutoff(day.Add(time.Minute)), cutoff(day.Add(23*time.Hour)))
	require.Equal(t, cutoff(day).AddDate(0, 0, 1), cutoff(day.AddDate(0, 0, 1)))
}
