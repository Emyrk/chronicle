package ratingmath

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type guildKey struct {
	realm, guild               uuid.UUID
	instance, boss, difficulty string
	size                       int16
}

type guildEvidence struct {
	bestTime, periodTime float64
	parses               []ParseObservation
}

type guildScopeKey struct {
	guild          guildKey // instance and boss cleared
	rating, window string
}

type guildTotals struct {
	career, period           float64
	careerKills, periodKills int32
}

// tenantTimeRankOne compares every canonical kill in a tenant, including
// guild-less and unassigned-realm kills. Policies choose what is published,
// not which kills can establish the tenant's fastest time.
func tenantTimeRankOne(ctx context.Context, store ratingStore, tenant uuid.UUID, asOf time.Time,
	limits RebuildLimits, periods []time.Time) (map[guildKey]float64, error) {
	fastest := make(map[guildKey]float64)
	runs := 0
	for after := uuid.Nil; ; {
		ids, err := store.ListRatingRunsForTenant(ctx, database.ListRatingRunsForTenantParams{
			TenantID: tenant, AfterRunID: after, BatchSize: pageSize,
		})
		if err != nil {
			return nil, err
		}
		if runs+len(ids) > limits.MaxRuns {
			return nil, fmt.Errorf("guild rating run safety bound exceeded")
		}
		runs += len(ids)
		if _, err := store.BackfillGuildRenownFactsForRuns(ctx, database.BackfillGuildRenownFactsForRunsParams{
			TenantID: tenant, RunIds: ids,
		}); err != nil {
			return nil, err
		}
		rows, err := store.GuildRatingObservationsForRuns(ctx, database.GuildRatingObservationsForRunsParams{
			TenantID: tenant, RunIds: ids,
		})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if !row.KilledAt.Valid || !row.KilledAt.Time.Before(asOf) || row.RawDurationMs <= 0 {
				continue
			}
			key := guildKey{instance: row.InstanceName, boss: row.EncounterName,
				difficulty: row.DifficultyName, size: row.MaxPlayers}
			if best := fastest[key]; best == 0 || row.RawDurationMs < best {
				fastest[key] = row.RawDurationMs
			}
			for _, period := range periods {
				if !row.KilledAt.Time.Before(period) {
					periodKey := key
					periodKey.instance += ":period:" + period.Format(time.RFC3339Nano)
					if best := fastest[periodKey]; best == 0 || row.RawDurationMs < best {
						fastest[periodKey] = row.RawDurationMs
					}
				}
			}
		}
		if len(ids) < int(pageSize) {
			break
		}
		after = ids[len(ids)-1]
	}
	return fastest, nil
}

func buildGuildGroup(ctx context.Context, store ratingStore, generation, tenant, group uuid.UUID,
	policy database.RatingGroupPolicy, bosses []database.RatingGroupBossPolicy, raids []database.RatingGroupRaidPolicy,
	asOf time.Time, limits RebuildLimits, fastest map[guildKey]float64, tenantFacts *int) (int, error) {
	manifest := make(map[BossKey]database.RatingGroupBossPolicy, len(bosses))
	for _, boss := range bosses {
		manifest[BossKey{Instance: boss.InstanceName, Encounter: boss.EncounterName}] = boss
	}
	periodStart := asOf.AddDate(0, 0, -int(policy.PeriodDays))
	observations := make(map[guildKey]*guildEvidence)
	runs, written := 0, 0
	for after := uuid.Nil; ; {
		ids, err := store.ListRatingRunsForGroup(ctx, database.ListRatingRunsForGroupParams{
			TenantID: tenant, GroupID: group, AfterRunID: after, BatchSize: pageSize,
		})
		if err != nil {
			return written, err
		}
		if runs+len(ids) > limits.MaxRuns {
			return written, fmt.Errorf("guild rating run safety bound exceeded")
		}
		runs += len(ids)
		rows, err := store.GuildRatingObservationsForRuns(ctx, database.GuildRatingObservationsForRunsParams{
			TenantID: tenant, RunIds: ids,
		})
		if err != nil {
			return written, err
		}
		for _, row := range rows {
			if !row.GuildID.Valid || !row.KilledAt.Valid || !row.KilledAt.Time.Before(asOf) || row.RawDurationMs <= 0 {
				continue
			}
			if _, ok := manifest[BossKey{Instance: row.InstanceName, Encounter: row.EncounterName}]; !ok {
				continue
			}
			key := guildKey{realm: row.RealmID, guild: row.GuildID.UUID, instance: row.InstanceName,
				boss: row.EncounterName, difficulty: row.DifficultyName, size: row.MaxPlayers}
			entry := observations[key]
			if entry == nil {
				entry = &guildEvidence{}
				observations[key] = entry
			}
			if entry.bestTime == 0 || row.RawDurationMs < entry.bestTime {
				entry.bestTime = row.RawDurationMs
			}
			if !row.KilledAt.Time.Before(periodStart) {
				if entry.periodTime == 0 || row.RawDurationMs < entry.periodTime {
					entry.periodTime = row.RawDurationMs
				}
				if row.HasLockedParse {
					entry.parses = append(entry.parses, ParseObservation{Score: row.LockedParse,
						KilledAt: row.KilledAt.Time, ID: row.RunID.String()})
				}
			}
		}
		if len(ids) < int(pageSize) {
			break
		}
		after = ids[len(ids)-1]
	}
	scopeEvidence := make(map[guildScopeKey]map[BossKey]float64)
	track := func(key guildKey, rating, window string, score float64) {
		boss := BossKey{Instance: key.instance, Encounter: key.boss}
		key.instance, key.boss = "", ""
		scope := guildScopeKey{guild: key, rating: rating, window: window}
		if scopeEvidence[scope] == nil {
			scopeEvidence[scope] = make(map[BossKey]float64)
		}
		scopeEvidence[scope][boss] = score
	}
	for key, entry := range observations {
		cohort := key
		cohort.realm, cohort.guild = uuid.Nil, uuid.Nil
		periodKey := cohort
		periodKey.instance += ":period:" + periodStart.Format(time.RFC3339Nano)
		for _, window := range []struct {
			kind    string
			best    float64
			fastest float64
		}{{"all_time", entry.bestTime, fastest[cohort]}, {"period", entry.periodTime, fastest[periodKey]}} {
			if window.best <= 0 || window.fastest <= 0 {
				continue
			}
			score, err := PeakTime(window.best, window.fastest)
			if err != nil {
				return written, err
			}
			row := guildScoreParams(generation, tenant, group, key, "peak", window.kind, score, asOf, periodStart)
			row.BestRaw = pgtype.Float8{Float64: window.best, Valid: true}
			row.RankOneRaw = pgtype.Float8{Float64: window.fastest, Valid: true}
			if err := store.InsertGuildRatingBossScore(ctx, row); err != nil {
				return written, err
			}
			written++
			track(key, "peak", window.kind, score)
		}
		if len(entry.parses) == 0 {
			continue
		}
		mastery, err := ScoreMastery(entry.parses, MasteryPolicy{
			HalfLife:   time.Duration(policy.HalfLifeDays * float64(24*time.Hour)),
			BestWeight: policy.BestWeight, FormWeight: policy.FormWeight, FloorWeight: policy.FloorWeight,
			RankWeight: masteryRankWeight(policy, key.instance, key.boss),
		})
		if err != nil {
			return written, err
		}
		for _, value := range []struct {
			metric string
			score  float64
		}{{"mastery", mastery.Mastery}, {"ranked_mastery", mastery.Ranked}} {
			row := guildScoreParams(generation, tenant, group, key, value.metric, "period", value.score, asOf, periodStart)
			row.BestLockedParse = pgtype.Float8{Float64: mastery.Best, Valid: true}
			row.Form = pgtype.Float8{Float64: mastery.Form, Valid: true}
			row.FloorScore = pgtype.Float8{Float64: mastery.Floor, Valid: true}
			row.EligibleKills = int32(mastery.EligibleKills)
			if err := store.InsertGuildRatingBossScore(ctx, row); err != nil {
				return written, err
			}
			written++
			track(key, value.metric, "period", value.score)
		}
	}
	totals := make(map[guildKey]*guildTotals)
	for cursorTime, cursorID := time.Date(1, 1, 1, 0, 0, 0, 0, time.UTC), uuid.Nil; ; {
		rows, err := store.ListGroupGuildRenownFacts(ctx, database.ListGroupGuildRenownFactsParams{
			TenantID: tenant, GroupID: group, WindowEnd: database.Timestamptz(asOf),
			AfterKilledAt: database.Timestamptz(cursorTime), AfterID: cursorID, BatchSize: pageSize,
		})
		if err != nil {
			return written, err
		}
		if *tenantFacts+len(rows) > limits.MaxFacts {
			return written, fmt.Errorf("guild renown fact safety bound exceeded")
		}
		*tenantFacts += len(rows)
		for _, fact := range rows {
			boss, ok := manifest[BossKey{Instance: fact.InstanceName, Encounter: fact.EncounterName}]
			if !ok {
				continue
			}
			key := guildKey{realm: fact.RealmID, guild: fact.GuildID, instance: fact.InstanceName, boss: fact.EncounterName}
			entry := totals[key]
			if entry == nil {
				entry = &guildTotals{}
				totals[key] = entry
			}
			points, err := RenownAward(boss.RenownPoints)
			if err != nil {
				return written, err
			}
			entry.career += points
			entry.careerKills++
			if !fact.KilledAt.Time.Before(periodStart) {
				entry.period += points
				entry.periodKills++
			}
		}
		if len(rows) < int(pageSize) {
			break
		}
		cursorTime, cursorID = rows[len(rows)-1].KilledAt.Time, rows[len(rows)-1].ID
	}
	for key, entry := range totals {
		for _, window := range []struct {
			kind   string
			points float64
			kills  int32
		}{{"career", entry.career, entry.careerKills}, {"period", entry.period, entry.periodKills}} {
			if window.kills == 0 {
				continue
			}
			row := guildScoreParams(generation, tenant, group, key, "renown", window.kind, window.points, asOf, periodStart)
			row.EligibleKills = window.kills
			if err := store.InsertGuildRatingBossScore(ctx, row); err != nil {
				return written, err
			}
			written++
			track(key, "renown", window.kind, window.points)
		}
	}
	scopes, err := writeGuildScopes(ctx, store, generation, tenant, group, scopeEvidence, bosses, raids)
	return written + scopes, err
}

func guildScoreParams(generation, tenant, group uuid.UUID, key guildKey, rating, window string,
	score float64, asOf, start time.Time) database.InsertGuildRatingBossScoreParams {
	row := database.InsertGuildRatingBossScoreParams{GenerationID: generation, TenantID: tenant,
		GroupID: group, RealmID: key.realm, GuildID: key.guild, InstanceName: key.instance,
		EncounterName: key.boss, DifficultyName: key.difficulty, MaxPlayers: key.size,
		RatingMetric: rating, WindowKind: window, Score: score}
	if window == "period" {
		row.WindowStart, row.WindowEnd = database.Timestamptz(start), database.Timestamptz(asOf)
	}
	return row
}

func writeGuildScopes(ctx context.Context, store ratingStore, generation, tenant, group uuid.UUID,
	evidence map[guildScopeKey]map[BossKey]float64, bosses []database.RatingGroupBossPolicy,
	raids []database.RatingGroupRaidPolicy) (int, error) {
	bossesByRaid := make(map[string][]database.RatingGroupBossPolicy)
	for _, boss := range bosses {
		bossesByRaid[boss.InstanceName] = append(bossesByRaid[boss.InstanceName], boss)
	}
	written := 0
	for key, observed := range evidence {
		perRaid := make(map[string]float64, len(raids))
		for _, raid := range raids {
			eligible := bossesByRaid[raid.InstanceName]
			if len(eligible) == 0 {
				return written, fmt.Errorf("raid %q has no eligible bosses", raid.InstanceName)
			}
			var numerator, denominator float64
			hasEvidence := false
			for _, boss := range eligible {
				value, ok := observed[BossKey{Instance: raid.InstanceName, Encounter: boss.EncounterName}]
				if ok {
					hasEvidence = true
				}
				if key.rating == "renown" {
					numerator += value
					continue
				}
				weight := boss.MasteryWeight
				if key.rating == "peak" {
					weight = boss.PeakWeight
				}
				numerator += weight * value
				denominator += weight
			}
			if !hasEvidence {
				continue
			}
			score := numerator
			if key.rating != "renown" {
				score /= denominator
			}
			if math.IsNaN(score) || math.IsInf(score, 0) || score < 0 {
				return written, fmt.Errorf("invalid guild %s score for raid %q", key.rating, raid.InstanceName)
			}
			perRaid[raid.InstanceName] = score
			if err := store.InsertGuildRatingScopeScore(ctx, guildScopeParams(generation, tenant, group, key, raid.InstanceName, score)); err != nil {
				return written, err
			}
			written++
		}
		var numerator, denominator float64
		for _, raid := range raids {
			score := perRaid[raid.InstanceName]
			if key.rating == "renown" {
				numerator += score
				continue
			}
			weight := raid.MasteryWeight
			if key.rating == "peak" {
				weight = raid.PeakWeight
			}
			numerator += weight * score
			denominator += weight
		}
		if key.rating != "renown" {
			numerator /= denominator
		}
		if math.IsNaN(numerator) || math.IsInf(numerator, 0) || numerator < 0 {
			return written, fmt.Errorf("invalid global guild %s score", key.rating)
		}
		if err := store.InsertGuildRatingScopeScore(ctx, guildScopeParams(generation, tenant, group, key, "", numerator)); err != nil {
			return written, err
		}
		written++
	}
	return written, nil
}

func guildScopeParams(generation, tenant, group uuid.UUID, key guildScopeKey, instance string,
	score float64) database.InsertGuildRatingScopeScoreParams {
	c := key.guild
	return database.InsertGuildRatingScopeScoreParams{GenerationID: generation, TenantID: tenant,
		GroupID: group, RealmID: c.realm, GuildID: c.guild, InstanceName: instance,
		DifficultyName: c.difficulty, MaxPlayers: c.size, RatingMetric: key.rating, WindowKind: key.window,
		Score: score}
}
