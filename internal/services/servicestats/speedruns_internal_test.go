package servicestats

import (
	"context"
	"log/slog"
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
	require.Equal(t, "Heroic, 25 players", boardLabel(speedrunBoard{Difficulty: "heroic", MaxPlayers: 25}), "difficulty names are capitalized")
	require.Equal(t, "40 players", boardLabel(speedrunBoard{MaxPlayers: 40}))
	require.Equal(t, "Normal", boardLabel(speedrunBoard{Difficulty: "Normal"}))
	require.Empty(t, boardLabel(speedrunBoard{}))
}

func TestFormatClock(t *testing.T) {
	t.Parallel()
	for ms, want := range map[int64]string{0: "0:00", 59_000: "0:59", 2_292_000: "38:12", 3_600_000: "60:00", 5_730_000: "95:30", 5_233_099: "87:13"} {
		require.Equal(t, want, formatClock(ms))
	}
}

// speedrunStore serves boards and per-board leaderboards, and records the queries.
type speedrunStore struct {
	database.Store
	// categories maps an instance name to its log_instances.category; instances
	// not listed are raids.
	categories map[string]string
	boards     []database.SpeedrunInstanceBoardsRow
	rows       map[string][]database.SpeedrunLeaderboardRow // by instance|difficulty|size
	params     []database.SpeedrunLeaderboardParams
}

func (s *speedrunStore) StatsSpeedrunInstanceCategories(context.Context) ([]database.StatsSpeedrunInstanceCategoriesRow, error) {
	var out []database.StatsSpeedrunInstanceCategoriesRow
	seen := map[string]bool{}
	for _, b := range s.boards {
		if seen[b.InstanceName] {
			continue
		}
		seen[b.InstanceName] = true
		category := "raid"
		if c, ok := s.categories[b.InstanceName]; ok {
			category = c
		}
		out = append(out, database.StatsSpeedrunInstanceCategoriesRow{InstanceName: b.InstanceName, Category: pgtype.Text{String: category, Valid: true}})
	}
	return out, nil
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

	out, err := speedrunsProducer{category: CategoryRaids}.Compute(context.Background(), Tenant{Store: store})
	require.NoError(t, err)
	keys := make([]string, len(out))
	for i, o := range out {
		keys[i] = o.Key
	}
	require.Equal(t, []string{"speedruns-raids/molten-core", "speedruns-raids/naxxramas"}, keys, "an instance with no ranked run gets no page")

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
	out, err := speedrunsProducer{category: CategoryRaids}.Compute(context.Background(), Tenant{Store: store})
	require.NoError(t, err)
	require.Len(t, out, 1, "two instances that slug alike never share a page")
	require.Equal(t, "Zul'Gurub", out[0].Payload.(*speedrunsPayload).Instance)
}

// Equal times come back from the query in either order; the board breaks the tie
// by guild ID so an unchanged board is an unchanged payload.
func TestBuildSpeedrunBoardTieOrderIsStable(t *testing.T) {
	t.Parallel()
	done := time.Date(2026, 11, 10, 20, 0, 0, 0, time.UTC)
	a, b, c := run("A", 2_000_000, done, "a"), run("B", 2_000_000, done, "b"), run("C", 1_900_000, done, "c")
	forward := buildSpeedrunBoard("", 40, []database.SpeedrunLeaderboardRow{a, b, c})
	backward := buildSpeedrunBoard("", 40, []database.SpeedrunLeaderboardRow{b, a, c})
	require.Equal(t, forward, backward)
	require.Equal(t, "C", forward.Runs[0].Guild)
	first, second := forward.Runs[1], forward.Runs[2]
	require.Less(t, first.GuildID, second.GuildID, "tied runs ordered by guild ID")
	require.Equal(t, []int{1, 2, 3}, []int{forward.Runs[0].Rank, first.Rank, second.Rank})
}

// An instance with no ranked clear does not claim its slug, so a later instance
// that slugs alike can have the page.
func TestSpeedrunsProducerSlugClaimedByRankedInstanceOnly(t *testing.T) {
	t.Parallel()
	done := time.Now()
	store := &speedrunStore{
		boards: []database.SpeedrunInstanceBoardsRow{
			{InstanceName: "Zul Gurub", MaxPlayers: 20},
			{InstanceName: "Zul'Gurub", MaxPlayers: 20},
		},
		rows: map[string][]database.SpeedrunLeaderboardRow{
			"Zul Gurub||2": {},
			"Zul'Gurub||2": {run("B", 1000, done, "b")},
		},
	}
	out, err := speedrunsProducer{category: CategoryRaids}.Compute(context.Background(), Tenant{Store: store})
	require.NoError(t, err)
	require.Len(t, out, 1)
	require.Equal(t, "Zul'Gurub", out[0].Payload.(*speedrunsPayload).Instance)
}

// Each category's producer publishes only its own instances, and an instance
// whose category is neither raid nor dungeon has no page.
func TestSpeedrunsProducerSplitsByCategory(t *testing.T) {
	t.Parallel()
	done := time.Now()
	store := &speedrunStore{
		categories: map[string]string{"Deadmines": "dungeon", "Mystery": "scenario"},
		boards: []database.SpeedrunInstanceBoardsRow{
			{InstanceName: "Deadmines", MaxPlayers: 5},
			{InstanceName: "Molten Core", MaxPlayers: 40},
			{InstanceName: "Mystery", MaxPlayers: 10},
		},
		rows: map[string][]database.SpeedrunLeaderboardRow{
			"Deadmines||0":   {run("D", 1000, done, "d")},
			"Molten Core||4": {run("M", 1000, done, "m")},
			"Mystery||1":     {run("X", 1000, done, "x")},
		},
	}
	keys := func(c InstanceCategory) []string {
		out, err := speedrunsProducer{category: c}.Compute(context.Background(), Tenant{Store: store})
		require.NoError(t, err)
		var k []string
		for _, o := range out {
			k = append(k, o.Key)
		}
		return k
	}
	require.Equal(t, []string{"speedruns-raids/molten-core"}, keys(CategoryRaids))
	require.Equal(t, []string{"speedruns-dungeons/deadmines"}, keys(CategoryDungeons))
	require.Equal(t, "speedruns-raids", speedrunsProducer{category: CategoryRaids}.Key())
	require.Equal(t, "speedruns-dungeons", speedrunsProducer{category: CategoryDungeons}.Key())
}

func TestInstancePaths(t *testing.T) {
	t.Parallel()

	require.Equal(t, "/stats/raids/molten-core", InstancePath(CategoryRaids, "molten-core"))
	require.Equal(t, "/stats/dungeons/deadmines", InstancePath(CategoryDungeons, "deadmines"))
	require.Equal(t, "/stats/raids/molten-core/speedruns", SpeedrunsPath(CategoryRaids, "molten-core"))
	require.Equal(t, "/stats/dungeons/deadmines/speedruns", SpeedrunsPath(CategoryDungeons, "deadmines"))
	require.Equal(t, "/stats/raids/molten-core/ragnaros", BossPath(CategoryRaids, "molten-core", "ragnaros"))
	require.Equal(t, "/stats/raids/molten-core/majordomo-executus", BossPath(CategoryRaids, "molten-core", InstanceSlug("Majordomo Executus")))

	// Bad input never becomes a URL no family serves.
	require.Empty(t, InstancePath("", "molten-core"))
	require.Empty(t, InstancePath("scenarios", "molten-core"))
	require.Empty(t, InstancePath(CategoryRaids, ""))
	require.Empty(t, InstancePath(CategoryRaids, "Molten Core"))
	require.Empty(t, SpeedrunsPath(CategoryRaids, "../x"))
	require.Empty(t, BossPath(CategoryRaids, "molten-core", ""))
	require.Empty(t, BossPath(CategoryRaids, "molten-core", "Ragnaros"))
	require.Empty(t, BossPath(CategoryRaids, "molten-core", "speedruns"), "that URL is the fastest-clears page")

	for _, raw := range []string{"raid", "dungeon"} {
		c, ok := CategoryFromDB(raw)
		require.True(t, ok, raw)
		require.True(t, c.Valid())
	}
	for _, raw := range []string{"", "scenario", "RAID"} {
		_, ok := CategoryFromDB(raw)
		require.False(t, ok, raw)
	}

	// Every path the helpers build is one the families route: a speedruns path
	// matches its family, and a boss path would not.
	svc, err := New(Options{Store: &speedrunStore{}, Logger: slog.New(slog.DiscardHandler)})
	require.NoError(t, err)
	for _, c := range []InstanceCategory{CategoryRaids, CategoryDungeons} {
		f := svc.Family("speedruns-" + string(c))
		require.NotNil(t, f)
		key, ok := f.Match(SpeedrunsPath(c, "some-instance"))
		require.True(t, ok)
		require.Equal(t, "speedruns-"+string(c)+"/some-instance", key)
		path, ok := f.PathForKey(key)
		require.True(t, ok)
		require.Equal(t, SpeedrunsPath(c, "some-instance"), path)
		_, ok = f.Match(BossPath(c, "some-instance", "ragnaros"))
		require.False(t, ok)
	}
	// A raid page is never served by the dungeons family.
	_, ok := svc.Family("speedruns-dungeons").Match(SpeedrunsPath(CategoryRaids, "x"))
	require.False(t, ok)
}
