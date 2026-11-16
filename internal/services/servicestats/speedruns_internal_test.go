package servicestats

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

func TestInstanceSlug(t *testing.T) {
	t.Parallel()
	for name, want := range map[string]string{
		"Molten Core":               "molten-core",
		"Onyxia's Lair":             "onyxia-s-lair",
		"Zul'Gurub":                 "zul-gurub",
		"Temple of Ahn'Qiraj":       "temple-of-ahn-qiraj",
		"Ruins of Ahn'Qiraj":        "ruins-of-ahn-qiraj",
		"Upper Tower of Karazhan":   "upper-tower-of-karazhan",
		"  Blackwing   Lair  ":      "blackwing-lair",
		"Naxxramas (10 Player)":     "naxxramas-10-player",
		"Scarlet Monastery: Armory": "scarlet-monastery-armory",
		"---":                       "",
		"":                          "",
	} {
		require.Equal(t, want, InstanceSlug(name), name)
	}
	// Every slug fits the pattern that path parameters and page keys require.
	for _, name := range []string{"Molten Core", "Onyxia's Lair", "Zul'Gurub", "Naxxramas (10 Player)"} {
		require.Regexp(t, slugPattern, InstanceSlug(name))
	}
}

func run(guild string, ms int64, done time.Time, slug string) database.SpeedrunLeaderboardRow {
	return database.SpeedrunLeaderboardRow{
		InstanceID:     uuid.New(),
		GuildID:        uuid.NullUUID{UUID: uuid.New(), Valid: true},
		GuildName:      guild,
		DurationMs:     ms,
		CompletionTime: pgtype.Timestamptz{Time: done, Valid: true},
		HashedSlug:     pgtype.Text{String: slug, Valid: slug != ""},
	}
}

func TestBuildSpeedrunBoard(t *testing.T) {
	t.Parallel()
	done := time.Date(2026, 11, 10, 20, 0, 0, 0, time.UTC)
	rows := []database.SpeedrunLeaderboardRow{
		run("Nightfall", 2_292_000, done, "abc123"),
		{GuildName: "", DurationMs: 2_300_000, CompletionTime: pgtype.Timestamptz{Time: done, Valid: true}}, // no guild
		run("Zero", 0, done, "zzz"),
		run("Second", 2_400_000, done.Add(time.Hour), ""),
	}
	board := buildSpeedrunBoard("Normal", 40, rows)
	require.Equal(t, 2, board.Ranked, "rows without a guild or a time are not ranked")
	require.Len(t, board.Runs, 2)
	require.Equal(t, 1, board.Runs[0].Rank)
	require.Equal(t, "abc123", board.Runs[0].RaidID, "the raid link uses the hashed slug")
	require.Equal(t, board.Runs[1].RaidID, rows[3].InstanceID.String(), "else the instance ID")
	require.Equal(t, 2, board.Runs[1].Rank)

	// Only the top speedrunsShown are kept, but every guild is counted.
	var many []database.SpeedrunLeaderboardRow
	for i := 0; i < speedrunsShown+10; i++ {
		many = append(many, run("G", int64(1000+i), done, ""))
	}
	board = buildSpeedrunBoard("", 0, many)
	require.Equal(t, speedrunsShown+10, board.Ranked)
	require.Len(t, board.Runs, speedrunsShown)
}

func TestSortSpeedrunBoardsAndLabels(t *testing.T) {
	t.Parallel()
	boards := []speedrunBoard{
		{Difficulty: "10 Player", MaxPlayers: 10, Ranked: 5},
		{Difficulty: "25 Player", MaxPlayers: 25, Ranked: 5},
		{Difficulty: "", MaxPlayers: 40, Ranked: 9},
	}
	sortSpeedrunBoards(boards)
	require.Equal(t, []int32{40, 25, 10}, []int32{boards[0].MaxPlayers, boards[1].MaxPlayers, boards[2].MaxPlayers}, "most ranked guilds, then larger raids")

	require.Equal(t, "25 Player", boardLabel(speedrunBoard{Difficulty: "25 Player", MaxPlayers: 25}))
	require.Equal(t, "Heroic, 25 players", boardLabel(speedrunBoard{Difficulty: "Heroic", MaxPlayers: 25}))
	require.Equal(t, "40 players", boardLabel(speedrunBoard{MaxPlayers: 40}))
	require.Equal(t, "Normal", boardLabel(speedrunBoard{Difficulty: "Normal"}))
	require.Empty(t, boardLabel(speedrunBoard{}))
}

func TestFormatClock(t *testing.T) {
	t.Parallel()
	for ms, want := range map[int64]string{0: "0:00", 59_000: "0:59", 2_292_000: "38:12", 3_600_000: "1:00:00", 5_233_099: "1:27:13"} {
		require.Equal(t, want, formatClock(ms))
	}
}

// speedrunStore serves boards and per-board leaderboards, and records the queries.
type speedrunStore struct {
	database.Store
	boards []database.SpeedrunInstanceBoardsRow
	rows   map[string][]database.SpeedrunLeaderboardRow // by instance|difficulty|size
	params []database.SpeedrunLeaderboardParams
}

func (s *speedrunStore) SpeedrunInstanceBoards(context.Context) ([]database.SpeedrunInstanceBoardsRow, error) {
	return s.boards, nil
}

func (s *speedrunStore) SpeedrunLeaderboard(_ context.Context, p database.SpeedrunLeaderboardParams) ([]database.SpeedrunLeaderboardRow, error) {
	s.params = append(s.params, p)
	return s.rows[p.InstanceName+"|"+p.DifficultyName+"|"+string(rune('0'+p.InstanceMaxPlayers/10))], nil
}

func TestSpeedrunsProducer(t *testing.T) {
	t.Parallel()
	done := time.Date(2026, 11, 10, 20, 0, 0, 0, time.UTC)
	store := &speedrunStore{
		boards: []database.SpeedrunInstanceBoardsRow{
			{InstanceName: "Molten Core", MaxPlayers: 40},
			{InstanceName: "Naxxramas", DifficultyName: "10 Player", MaxPlayers: 10},
			{InstanceName: "Naxxramas", DifficultyName: "25 Player", MaxPlayers: 25},
			{InstanceName: "Blackwing Lair", MaxPlayers: 40}, // listed, but no valid run on the leaderboard
			{InstanceName: "!!!", MaxPlayers: 40},            // no usable slug
		},
		rows: map[string][]database.SpeedrunLeaderboardRow{
			"Molten Core||4":        {run("Nightfall", 2_292_000, done, "mc1")},
			"Naxxramas|10 Player|1": {run("Ten", 3_000_000, done, "n10")},
			"Naxxramas|25 Player|2": {run("A", 3_100_000, done, "n25a"), run("B", 3_200_000, done, "n25b")},
		},
	}

	out, err := speedrunsProducer{}.Compute(context.Background(), Tenant{Store: store})
	require.NoError(t, err)
	keys := make([]string, len(out))
	for i, o := range out {
		keys[i] = o.Key
	}
	require.Equal(t, []string{"speedruns/molten-core", "speedruns/naxxramas"}, keys, "an instance with no ranked run gets no page")

	for _, p := range store.params {
		require.True(t, p.FilterDifficulty)
		require.True(t, p.FilterInstanceMaxPlayers)
		require.False(t, p.UseRankedTiming, "full-clear timing, the leaderboard's default")
		require.EqualValues(t, speedrunsFetch, p.ResultLimit)
		require.Empty(t, p.RealmNames, "the whole server, not one realm")
	}

	naxx := out[1].Payload.(*speedrunsPayload)
	require.Equal(t, "Naxxramas", naxx.Instance)
	require.Equal(t, "25 Player", naxx.Boards[0].Difficulty, "the board with the most ranked guilds leads")
	require.Equal(t, 2, out[1].SampleN)
	require.Equal(t, speedrunsMinSample, out[1].MinSample)
	require.Equal(t, 1, out[0].SampleN)
}

func TestSpeedrunsProducerSlugCollision(t *testing.T) {
	t.Parallel()
	done := time.Now()
	store := &speedrunStore{
		boards: []database.SpeedrunInstanceBoardsRow{
			{InstanceName: "Zul'Gurub", MaxPlayers: 20},
			{InstanceName: "Zul Gurub", MaxPlayers: 20},
		},
		rows: map[string][]database.SpeedrunLeaderboardRow{
			"Zul'Gurub||2": {run("A", 1000, done, "a")},
			"Zul Gurub||2": {run("B", 1000, done, "b")},
		},
	}
	out, err := speedrunsProducer{}.Compute(context.Background(), Tenant{Store: store})
	require.NoError(t, err)
	require.Len(t, out, 1, "two instances that slug alike never share a page")
	require.Equal(t, "Zul'Gurub", out[0].Payload.(*speedrunsPayload).Instance)
}
