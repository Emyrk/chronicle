package api

import (
	"context"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/database"
	overviewmetricsversion "github.com/Emyrk/chronicle/internal/overviewmetrics"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
)

const (
	// clearCardMinScore is the server clear-time parse a qualified speedrun
	// needs before /instances/{id} shares the clear card instead of the raid
	// card.
	clearCardMinScore = 90
	// clearCardBoardLimit caps the realm leaderboard read for realm rank and
	// the previous record. A run placing below it gets the "Top N%" pill.
	clearCardBoardLimit = 100
	// clearCardTimeout bounds loadClearCard. It runs alongside loadRaidCard,
	// so it adds no time to the first byte unless it is the slower of the two.
	clearCardTimeout = 1500 * time.Millisecond
	// clearCardGuildLookbackDays reaches back for the guild's own earlier
	// runs (the cohort endpoint's maximum).
	clearCardGuildLookbackDays = 3650
)

// clearCard is what the OG service's clear template draws (template=clear)
// on top of the raid card's guild, raid, realm, players and wipes.
type clearCard struct {
	DurationMs int64
	Score      int // server clear-time parse, display score
	Rank, Of   int // server rank of the time-parse sample
	RealmRank  *int
	DeltaSecs  *int // vs the previous realm record; only on a new record
	Splits     []clearCardSplit
}

type clearCardSplit struct {
	Name string
	Secs int
}

// clearCardParams encodes the clear template's query params, for
// ogImageURL(r, "clear", clearCardParams(raid, sr)).
func clearCardParams(raid raidCard, sr clearCard) url.Values {
	q := url.Values{}
	setIf := func(k, v string) {
		if v != "" {
			q.Set(k, v)
		}
	}
	setIf("host", raid.Host)
	setIf("guild", raid.Guild)
	setIf("raid", raid.Raid)
	setIf("realm", raid.Realm)
	q.Set("ms", strconv.FormatInt(sr.DurationMs, 10))
	q.Set("score", strconv.Itoa(sr.Score))
	if sr.Rank > 0 && sr.Of > 0 {
		q.Set("rank", strconv.Itoa(sr.Rank))
		q.Set("of", strconv.Itoa(sr.Of))
	}
	if sr.RealmRank != nil {
		q.Set("realmrank", strconv.Itoa(*sr.RealmRank))
	}
	if sr.DeltaSecs != nil {
		q.Set("delta", strconv.Itoa(*sr.DeltaSecs))
	}
	if raid.Wipes != nil {
		q.Set("wipes", strconv.Itoa(*raid.Wipes))
	}
	if raid.Players != nil {
		q.Set("players", strconv.Itoa(*raid.Players))
	}
	if len(sr.Splits) > 0 {
		splits := make([]string, 0, len(sr.Splits))
		for _, s := range sr.Splits {
			splits = append(splits, s.Name+":"+strconv.Itoa(s.Secs))
		}
		q.Set("splits", strings.Join(splits, ","))
	}
	return q
}

// loadClearCard returns the clear card when inst is a qualified speedrun
// whose server clear-time parse is at least clearCardMinScore; ok is false
// otherwise, and the page keeps the raid card. The speedrun, time-parse and
// progression lookups run in parallel; only a qualifying run then reads the
// realm leaderboard (realm rank, previous record) and the guild's own runs,
// also in parallel. Everything shares clearCardTimeout, derived from r's
// context (which carries the tenant for RLS). A failed or timed-out board
// read only drops realm rank and delta: the card shows the "Top N%" pill.
func (api *API) loadClearCard(r *http.Request, inst database.LogInstancesGuild, encounters []database.LogInstanceEncounter) (clearCard, bool) {
	ctx, cancel := context.WithTimeout(r.Context(), clearCardTimeout)
	defer cancel()
	db := api.Opts.Zed

	var (
		wg          sync.WaitGroup
		run         database.GetInstanceSpeedrunRow
		runErr      error
		score       database.TimeParseScore
		scoreOK     bool
		progression []string
		listed      bool
	)
	wg.Go(func() {
		run, runErr = db.GetInstanceSpeedrun(ctx, inst.ID)
	})
	wg.Go(func() {
		// GetInstanceSpeedrun doesn't check unlisted, but the board leaves
		// unlisted runs out, so an unlisted run gets no realm rank or delta.
		unlisted, err := db.GetWoWLogGroupUnlisted(ctx, inst.LogGroupID)
		listed = err == nil && !unlisted
	})
	wg.Go(func() {
		tenantID := servicetenant.TenantIDFromContext(ctx)
		if tenantID != uuid.Nil {
			// Same check as the time-parses endpoint.
			tenant, err := db.GetTenantByID(ctx, tenantID)
			if err == nil && servicerankings.IsParseDisabled(tenant.ParseConfig) {
				return
			}
		}
		var err error
		score, err = db.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{
			TenantID:      tenantID,
			InstanceID:    inst.ID,
			LookbackDays:  servicerankings.TimeParseScoreLookbackDays,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion),
			QueryVersion:  timeparsepolicy.QueryVersion,
		})
		scoreOK = err == nil
	})
	wg.Go(func() {
		if api.Chronicle != nil {
			progression, _ = api.Chronicle.RegistryForFlavor(api.resolvedSiteFlavor(ctx)).ProgressionBosses(inst.Name)
		}
	})
	wg.Wait()

	durationMs := run.DurationMs
	if run.RankedDurationMs.Valid {
		durationMs = run.RankedDurationMs.Int64
	}
	if runErr != nil || !run.Qualified || durationMs <= 0 || !scoreOK {
		return clearCard{}, false
	}
	status := score.ClearServerStatus.String
	if !score.ClearDurationMs.Valid || (status != string(timeparsepolicy.StatusOK) && status != string(timeparsepolicy.StatusLowConfidence)) ||
		int(score.ClearServerDisplayScore.Int16) < clearCardMinScore {
		return clearCard{}, false
	}

	start := coalesceTime(run.RankedStartTime, run.StartTime)
	card := clearCard{
		DurationMs: durationMs,
		Score:      int(score.ClearServerDisplayScore.Int16),
		Rank:       int(score.ClearServerRank.Int32),
		Of:         int(score.ClearServerSampleSize.Int32),
		Splits:     clearSplits(encounters, progression, start, coalesceTime(run.RankedCompletionTime, run.CompletionTime)),
	}
	if !run.GuildID.Valid || !listed {
		return card, true // the board only ranks listed guild runs
	}

	board := database.SpeedrunLeaderboardParams{
		InstanceName:     inst.Name,
		RealmNames:       []string{inst.RealmName},
		FilterDifficulty: true,
		DifficultyName:   inst.DifficultyName,
		ResultLimit:      clearCardBoardLimit,
	}
	var (
		realmRows []database.SpeedrunLeaderboardRow
		guildRuns []database.InstanceSpeedrunCohortRow
		realmErr  error
		guildErr  error
	)
	wg.Go(func() {
		realmRows, realmErr = db.SpeedrunLeaderboard(ctx, board)
	})
	wg.Go(func() {
		// The board keeps one run per guild (even with its guild filter), so
		// the guild's earlier runs come from its cohort: every run it started
		// before this one, same difficulty and raid size.
		guildRuns, guildErr = db.InstanceSpeedrunCohort(ctx, database.InstanceSpeedrunCohortParams{
			InstanceID:     inst.ID,
			MetricsVersion: overviewmetricsversion.CurrentVersion,
			LookbackDays:   clearCardGuildLookbackDays,
			Scope:          "guild",
		})
	})
	wg.Wait()
	if realmErr != nil {
		return card, true
	}
	self := clearSelf{
		instanceID:     inst.ID,
		duplicateGroup: inst.DuplicateGroupID,
		guildID:        run.GuildID.UUID,
		durationMs:     durationMs,
		start:          start,
	}
	rank, ok := clearRealmRank(realmRows, self, clearCardBoardLimit)
	if !ok {
		return card, true
	}
	card.RealmRank = &rank
	if rank == 1 && guildErr == nil {
		own := make([]clearPastRun, 0, len(guildRuns))
		for _, row := range guildRuns {
			if row.Qualified && row.InstanceID != inst.ID && row.DurationMs.Valid && row.CompletionTime.Valid {
				own = append(own, clearPastRun{durationMs: row.DurationMs.Int64, completed: row.CompletionTime.Time})
			}
		}
		card.DeltaSecs = clearRecordDelta(realmRows, own, self, clearCardBoardLimit)
	}
	return card, true
}

// clearSelf identifies the shared run on the leaderboard.
type clearSelf struct {
	instanceID     uuid.UUID
	duplicateGroup uuid.NullUUID
	guildID        uuid.UUID
	durationMs     int64
	start          time.Time
}

// is reports whether row is the shared run or a duplicate upload of it.
func (s clearSelf) is(row database.SpeedrunLeaderboardRow) bool {
	return row.InstanceID == s.instanceID ||
		(s.duplicateGroup.Valid && row.DuplicateGroupID.Valid && row.DuplicateGroupID.UUID == s.duplicateGroup.UUID)
}

// clearRealmRank is the place the run's time takes on the realm board (best
// run per guild, fastest first): one more than the other runs strictly
// faster. rows is the board's first `limit` places; ok is false when the run
// places below them, as the rank isn't known then.
func clearRealmRank(rows []database.SpeedrunLeaderboardRow, self clearSelf, limit int) (rank int, ok bool) {
	faster := 0
	for _, row := range rows {
		if !self.is(row) && row.DurationMs < self.durationMs {
			faster++
		}
	}
	if faster >= len(rows) && len(rows) >= limit {
		return 0, false
	}
	return faster + 1, true
}

// clearPastRun is one of the guild's own earlier qualified runs.
type clearPastRun struct {
	durationMs int64
	completed  time.Time
}

// clearRecordDelta is the run's time minus the realm record it broke, in
// whole seconds (negative). The previous record is the fastest run that
// finished before this one started, among the realm board (each guild's
// best) and the guild's own earlier runs, so a guild beating its own record
// compares to it. Finishing before this start keeps duplicate uploads out.
//
// The board keeps only each guild's best, so an unseen earlier run could
// have been a faster record. The delta is dropped unless it is provably
// exact: when another guild's best finished at or after this start and beats
// the previous record (that guild may have held an earlier, unseen record in
// between), or when the board is full (limit rows) and the previous record
// is slower than its last row (a run past the cap could be faster). nil also
// when there is no earlier run or the run didn't beat it.
func clearRecordDelta(board []database.SpeedrunLeaderboardRow, own []clearPastRun, self clearSelf, limit int) *int {
	if self.start.IsZero() {
		return nil
	}
	previous := int64(math.MaxInt64)
	consider := func(durationMs int64, completed time.Time) {
		if durationMs > 0 && completed.Before(self.start) {
			previous = min(previous, durationMs)
		}
	}
	for _, row := range board {
		if !self.is(row) && row.CompletionTime.Valid {
			consider(row.DurationMs, row.CompletionTime.Time)
		}
	}
	for _, run := range own {
		consider(run.durationMs, run.completed)
	}
	if previous == math.MaxInt64 {
		return nil
	}
	for _, row := range board {
		later := !row.CompletionTime.Valid || !row.CompletionTime.Time.Before(self.start)
		otherGuild := !row.GuildID.Valid || row.GuildID.UUID != self.guildID
		if !self.is(row) && otherGuild && later && row.DurationMs < previous {
			return nil
		}
	}
	if len(board) >= limit && len(board) > 0 && previous > board[len(board)-1].DurationMs {
		return nil
	}
	delta := int(math.Round(float64(self.durationMs-previous) / 1000))
	if delta >= 0 {
		return nil
	}
	return &delta
}

// clearSplits returns the time from the run start (or the previous kill) to
// each boss kill inside the ranked window, in kill order, so the splits sum
// to the clear. Kills at or before the start (ranked timing can start after
// a boss, as Ulduar does after Flame Leviathan) and after the completion
// (an optional boss after the last required one) are dropped. With a
// registry progression list only those bosses count; a boss killed twice
// counts once.
func clearSplits(encounters []database.LogInstanceEncounter, progression []string, start, completion time.Time) []clearCardSplit {
	listed := map[string]struct{}{}
	for _, name := range progression {
		listed[name] = struct{}{}
	}
	firstKill := map[string]time.Time{}
	for _, e := range encounters {
		if !e.Boss || !e.EndTime.Valid || (e.KillType != database.KillTypeClean && e.KillType != database.KillTypePartial) {
			continue
		}
		if _, ok := listed[e.Name]; len(listed) > 0 && !ok {
			continue
		}
		at := e.EndTime.Time
		if (!start.IsZero() && !at.After(start)) || (!completion.IsZero() && at.After(completion)) {
			continue
		}
		if prev, ok := firstKill[e.Name]; !ok || at.Before(prev) {
			firstKill[e.Name] = at
		}
	}
	type kill struct {
		name string
		at   time.Time
	}
	kills := make([]kill, 0, len(firstKill))
	for name, at := range firstKill {
		kills = append(kills, kill{name, at})
	}
	sort.Slice(kills, func(i, j int) bool { return kills[i].at.Before(kills[j].at) })

	splits := make([]clearCardSplit, 0, len(kills))
	previous := start
	for _, k := range kills {
		secs := 0
		if !previous.IsZero() && k.at.After(previous) {
			secs = int(math.Round(k.at.Sub(previous).Seconds()))
		}
		if name := ogSplitName(k.name); name != "" {
			splits = append(splits, clearCardSplit{Name: name, Secs: secs})
		}
		if k.at.After(previous) {
			previous = k.at
		}
	}
	return splits
}

// ogSplitNameMax is the longest boss name a split label keeps whole.
const ogSplitNameMax = 12

// ogSplitNames are short labels for long names the rules below get wrong.
var ogSplitNames = map[string]string{
	"Lord Blackwald II":      "Blackwald",
	"Keeper Gnarlmoon":       "Gnarlmoon",
	"Ley-Watcher Incantagos": "Incantagos",
	"Echo of Medivh":         "Medivh",
	"Twin Emperors":          "Twins",
	"Four Horsemen":          "Horsemen",
	"Eye of C'Thun":          "Eye",
	"Brood Queen Araxxna":    "Araxxna",
	"Clawlord Howlfang":      "Howlfang",
	"Archdruid Kronn":        "Kronn",
	"Chieftain Partath":      "Partath",
}

// ogBossTitles are leading words dropped from a split label, so "Baron
// Geddon" reads "Geddon" and "The Prophet Skeram" reads "Skeram".
var ogBossTitles = map[string]bool{
	"The": true, "High": true, "Lord": true, "Lady": true, "Baron": true, "Bloodlord": true, "Broodlord": true,
	"Princess": true, "Prince": true, "Battleguard": true, "Grand": true, "Instructor": true, "General": true,
	"Emperor": true, "Master": true,
}

// ogSplitName is a boss's short split label, without the list delimiters. A
// grouped encounter ("Bug Family: Vem") uses its group name. A name of 12
// characters or fewer stays whole; longer ones use ogSplitNames, else the
// part before " the ", then the last word after a title or else the first
// word ("Majordomo Executus" → "Majordomo").
func ogSplitName(name string) string {
	if group, _, ok := strings.Cut(name, ":"); ok {
		name = group
	}
	name = strings.TrimSpace(name)
	if short, ok := ogSplitNames[name]; ok {
		return ogCardName(short)
	}
	if len([]rune(name)) > ogSplitNameMax {
		if i := strings.Index(name, " the "); i > 0 {
			name = name[:i]
		}
		if words := strings.Fields(name); len(words) > 1 {
			if ogBossTitles[words[0]] {
				name = words[len(words)-1]
			} else {
				name = words[0]
			}
		}
	}
	return ogCardName(name)
}

func coalesceTime(preferred, fallback pgtype.Timestamptz) time.Time {
	if preferred.Valid {
		return preferred.Time
	}
	if fallback.Valid {
		return fallback.Time
	}
	return time.Time{}
}
