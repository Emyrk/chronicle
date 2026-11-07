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
	)
	wg.Go(func() {
		run, runErr = db.GetInstanceSpeedrun(ctx, inst.ID)
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

	card := clearCard{
		DurationMs: durationMs,
		Score:      int(score.ClearServerDisplayScore.Int16),
		Rank:       int(score.ClearServerRank.Int32),
		Of:         int(score.ClearServerSampleSize.Int32),
		Splits:     clearSplits(encounters, progression, coalesceTime(run.RankedStartTime, run.StartTime)),
	}
	if !run.GuildID.Valid {
		return card, true // the board only ranks guild runs
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
		durationMs:     durationMs,
		start:          coalesceTime(run.RankedStartTime, run.StartTime),
	}
	rank, ok := clearRealmRank(realmRows, self, clearCardBoardLimit)
	if !ok {
		return card, true
	}
	card.RealmRank = &rank
	if rank == 1 && guildErr == nil {
		past := make([]clearPastRun, 0, len(realmRows)+len(guildRuns))
		for _, row := range realmRows {
			if !self.is(row) && row.CompletionTime.Valid {
				past = append(past, clearPastRun{durationMs: row.DurationMs, completed: row.CompletionTime.Time})
			}
		}
		for _, row := range guildRuns {
			if row.Qualified && row.InstanceID != inst.ID && row.DurationMs.Valid && row.CompletionTime.Valid {
				past = append(past, clearPastRun{durationMs: row.DurationMs.Int64, completed: row.CompletionTime.Time})
			}
		}
		card.DeltaSecs = clearRecordDelta(past, self)
	}
	return card, true
}

// clearSelf identifies the shared run on the leaderboard.
type clearSelf struct {
	instanceID     uuid.UUID
	duplicateGroup uuid.NullUUID
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

// clearPastRun is another qualified run on the realm board or by the guild.
type clearPastRun struct {
	durationMs int64
	completed  time.Time
}

// clearRecordDelta is the run's time minus the realm record it broke, in
// whole seconds (negative). The previous record is the fastest of runs that
// finished before this one started: the realm board (each guild's best) plus
// the guild's own earlier runs, so a guild beating its own record compares
// to it. Requiring the finish before this start keeps duplicate uploads of
// the same raid out. Another guild's slower run is missed when that guild's
// best came later, since the board keeps only best runs. nil when there is
// no earlier run or the run didn't beat it.
func clearRecordDelta(past []clearPastRun, self clearSelf) *int {
	if self.start.IsZero() {
		return nil
	}
	previous := int64(math.MaxInt64)
	for _, run := range past {
		if run.durationMs > 0 && run.completed.Before(self.start) {
			previous = min(previous, run.durationMs)
		}
	}
	if previous == math.MaxInt64 {
		return nil
	}
	delta := int(math.Round(float64(self.durationMs-previous) / 1000))
	if delta >= 0 {
		return nil
	}
	return &delta
}

// clearSplits returns the time from the run start (or the previous kill) to
// each boss kill, in kill order, so the splits sum to the clear. With a
// registry progression list only those bosses count, so optional bosses
// (Gahz'ranka, Edge of Madness) don't add a split; a boss killed twice counts
// once.
func clearSplits(encounters []database.LogInstanceEncounter, progression []string, start time.Time) []clearCardSplit {
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
		if at, ok := firstKill[e.Name]; !ok || e.EndTime.Time.Before(at) {
			firstKill[e.Name] = e.EndTime.Time
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
		previous = k.at
	}
	return splits
}

// ogBossTitles are leading words dropped from a split label, so "Baron
// Geddon" reads "Geddon" and "The Prophet Skeram" reads "Skeram".
var ogBossTitles = map[string]bool{
	"The": true, "High": true, "Lord": true, "Lady": true, "Baron": true, "Bloodlord": true, "Broodlord": true,
	"Princess": true, "Prince": true, "Battleguard": true, "Grand": true, "Instructor": true, "General": true,
	"Emperor": true, "Twin": true, "Four": true,
}

// ogSplitName is a boss's short split label: the part before " the ", then
// the last word after a title or else the first word ("Majordomo Executus"
// → "Majordomo"), without the list delimiters.
func ogSplitName(name string) string {
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
