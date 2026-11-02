package ratingmath

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const pageSize int32 = 200

// RebuildLimits make a full generation fail rather than silently publish a
// partial leaderboard when a tenant grows beyond the operator's safety bound.
type RebuildLimits struct {
	MaxRuns, MaxFacts int
}

type ratingStore interface {
	ListTenantRatingPolicies(context.Context, uuid.UUID) ([]database.RatingGroupPolicy, error)
	ListRatingRaidPolicies(context.Context, database.ListRatingRaidPoliciesParams) ([]database.RatingGroupRaidPolicy, error)
	InsertRatingScopeScore(context.Context, database.InsertRatingScopeScoreParams) error
	ListRatingBossPolicies(context.Context, database.ListRatingBossPoliciesParams) ([]database.RatingGroupBossPolicy, error)
	ListRatingRunsForGroup(context.Context, database.ListRatingRunsForGroupParams) ([]uuid.UUID, error)
	ListRatingRunsForTenant(context.Context, database.ListRatingRunsForTenantParams) ([]uuid.UUID, error)
	RatingObservationsForRuns(context.Context, database.RatingObservationsForRunsParams) ([]database.RatingObservationsForRunsRow, error)
	GuildRatingObservationsForRuns(context.Context, database.GuildRatingObservationsForRunsParams) ([]database.GuildRatingObservationsForRunsRow, error)
	BackfillGuildRenownFactsForRun(context.Context, database.BackfillGuildRenownFactsForRunParams) (int64, error)
	ListGroupGuildRenownFacts(context.Context, database.ListGroupGuildRenownFactsParams) ([]database.ListGroupGuildRenownFactsRow, error)
	InsertGuildRatingBossScore(context.Context, database.InsertGuildRatingBossScoreParams) error
	InsertGuildRatingScopeScore(context.Context, database.InsertGuildRatingScopeScoreParams) error
	BackfillRenownFactsForRun(context.Context, uuid.UUID) (int64, error)
	ListGroupRenownFacts(context.Context, database.ListGroupRenownFactsParams) ([]database.ListGroupRenownFactsRow, error)
	InsertRatingScoreGeneration(context.Context, database.InsertRatingScoreGenerationParams) (database.RatingScoreGeneration, error)
	InsertRatingBossScore(context.Context, database.InsertRatingBossScoreParams) error
}

// scoredKey retains all cohort and character dimensions. It never merges DPS,
// HPS, specialization, difficulty, raid size, or different realms.
type scoredKey struct {
	realm                                                            uuid.UUID
	player, instance, boss, difficulty, class, spec, subSpec, metric string
	size                                                             int16
}

type scoredEvidence struct {
	bestRaw, periodRaw float64
	parses             []ParseObservation
}

type renownKey struct {
	realm                  uuid.UUID
	player, instance, boss string
}

type scopeKey struct {
	character      scoredKey // instance/boss cleared, cohort and metric retained
	rating, window string
}

type renownTotals struct {
	career, period           float64
	careerKills, periodKills int32
}

// tenantPeakRankOne includes eligible unassigned and guild-less runs in the
// tenant's comparison cohort. Rating groups select eligible content and policy,
// but never narrow the competitive denominator within a server.
func tenantPeakRankOne(ctx context.Context, store ratingStore, tenant uuid.UUID, asOf time.Time, limits RebuildLimits,
	periodStarts []time.Time) (map[scoredKey]float64, int, error) {
	rankOne := make(map[scoredKey]float64)
	runs := 0
	for after := uuid.Nil; ; {
		ids, err := store.ListRatingRunsForTenant(ctx, database.ListRatingRunsForTenantParams{
			TenantID: tenant, AfterRunID: after, BatchSize: pageSize,
		})
		if err != nil {
			return nil, runs, err
		}
		if runs+len(ids) > limits.MaxRuns {
			return nil, runs, fmt.Errorf("rating run safety bound exceeded")
		}
		runs += len(ids)
		for _, metric := range []string{"dps", "hps"} {
			rows, err := store.RatingObservationsForRuns(ctx, database.RatingObservationsForRunsParams{
				TenantID: tenant, RunIds: ids, Metric: metric,
			})
			if err != nil {
				return nil, runs, err
			}
			for _, row := range rows {
				if !row.KilledAt.Valid || !row.KilledAt.Time.Before(asOf) || row.RawValue <= 0 {
					continue
				}
				key := scoredKey{instance: row.InstanceName, boss: row.EncounterName,
					difficulty: row.DifficultyName, class: row.PlayerClass, spec: row.PlayerSpec,
					subSpec: row.PlayerSubSpec, metric: metric, size: row.MaxPlayers}
				if row.RawValue > rankOne[key] {
					rankOne[key] = row.RawValue
				}
				for _, start := range periodStarts {
					if !row.KilledAt.Time.Before(start) {
						periodKey := key
						periodKey.metric += ":period:" + start.Format(time.RFC3339Nano)
						if row.RawValue > rankOne[periodKey] {
							rankOne[periodKey] = row.RawValue
						}
					}
				}
			}
		}
		if len(ids) < int(pageSize) {
			break
		}
		after = ids[len(ids)-1]
	}
	return rankOne, runs, nil
}

// BuildTenantRatings reads canonical observations in bounded pages and builds
// an unpublished generation. The caller must verify current policy and group
// membership before activating it; a failed build leaves the active generation.
func BuildTenantRatings(ctx context.Context, store ratingStore, tenant uuid.UUID, asOf time.Time, limits RebuildLimits) (database.RatingScoreGeneration, int, error) {
	if asOf.IsZero() || limits.MaxRuns <= 0 || limits.MaxFacts <= 0 {
		return database.RatingScoreGeneration{}, 0, fmt.Errorf("as-of and positive safety bounds are required")
	}
	policies, err := store.ListTenantRatingPolicies(ctx, tenant)
	if err != nil {
		return database.RatingScoreGeneration{}, 0, err
	}
	if len(policies) == 0 {
		return database.RatingScoreGeneration{}, 0, nil
	}
	var maxVersion int32
	for _, p := range policies {
		if p.Version > maxVersion {
			maxVersion = p.Version
		}
	}
	generation, err := store.InsertRatingScoreGeneration(ctx, database.InsertRatingScoreGenerationParams{
		TenantID: tenant, PolicyVersion: maxVersion, AsOf: database.Timestamptz(asOf),
	})
	if err != nil {
		return generation, 0, err
	}
	periodStarts := make([]time.Time, 0, len(policies))
	for _, policy := range policies {
		periodStarts = append(periodStarts, asOf.AddDate(0, 0, -int(policy.PeriodDays)))
	}
	rankOne, _, err := tenantPeakRankOne(ctx, store, tenant, asOf, limits, periodStarts)
	if err != nil {
		return generation, 0, err
	}
	fastest, err := tenantTimeRankOne(ctx, store, tenant, asOf, limits, periodStarts)
	if err != nil {
		return generation, 0, err
	}
	written := 0
	runs, facts, guildFacts := 0, 0, 0
	for _, policy := range policies {
		group := policy.GroupID
		bosses, err := store.ListRatingBossPolicies(ctx, database.ListRatingBossPoliciesParams{
			TenantID: tenant, GroupID: group,
		})
		if err != nil {
			return generation, written, err
		}
		if len(bosses) == 0 {
			continue
		}
		manifest := make(map[BossKey]database.RatingGroupBossPolicy, len(bosses))
		for _, boss := range bosses {
			manifest[BossKey{Instance: boss.InstanceName, Encounter: boss.EncounterName}] = boss
		}
		raids, err := store.ListRatingRaidPolicies(ctx, database.ListRatingRaidPoliciesParams{GroupID: group, TenantID: tenant})
		if err != nil {
			return generation, written, err
		}
		raidWeights := make(map[string]database.RatingGroupRaidPolicy, len(raids))
		for _, raid := range raids {
			raidWeights[raid.InstanceName] = raid
		}
		for _, boss := range bosses {
			if _, ok := raidWeights[boss.InstanceName]; !ok {
				return generation, written, fmt.Errorf("raid %q has eligible bosses without configured raid weights", boss.InstanceName)
			}
		}
		scopeEvidence := make(map[scopeKey]map[BossKey]float64)
		track := func(character scoredKey, rating, window string, value float64) {
			boss := BossKey{Instance: character.instance, Encounter: character.boss}
			character.instance, character.boss = "", ""
			key := scopeKey{character: character, rating: rating, window: window}
			if scopeEvidence[key] == nil {
				scopeEvidence[key] = make(map[BossKey]float64)
			}
			scopeEvidence[key][boss] = value
		}
		periodStart := asOf.AddDate(0, 0, -int(policy.PeriodDays))
		observations := make(map[scoredKey]*scoredEvidence)
		for after := uuid.Nil; ; {
			ids, err := store.ListRatingRunsForGroup(ctx, database.ListRatingRunsForGroupParams{
				TenantID: tenant, GroupID: group,
				AfterRunID: after, BatchSize: pageSize,
			})
			if err != nil {
				return generation, written, err
			}
			if runs+len(ids) > limits.MaxRuns {
				return generation, written, fmt.Errorf("rating run safety bound exceeded")
			}
			runs += len(ids)
			// Earned credit is independent of parse quality. Persist the minimal
			// facts before source logs can be removed, even if a parse is absent.
			for _, runID := range ids {
				if _, err := store.BackfillRenownFactsForRun(ctx, runID); err != nil {
					return generation, written, err
				}
			}
			for _, metric := range []string{"dps", "hps"} {
				rows, err := store.RatingObservationsForRuns(ctx, database.RatingObservationsForRunsParams{
					TenantID: tenant, RunIds: ids, Metric: metric,
				})
				if err != nil {
					return generation, written, err
				}
				for _, row := range rows {
					if !row.KilledAt.Valid || !row.KilledAt.Time.Before(asOf) || row.KilledAt.Time.IsZero() {
						continue
					}
					if _, ok := manifest[BossKey{Instance: row.InstanceName, Encounter: row.EncounterName}]; !ok {
						continue
					}
					key := scoredKey{realm: row.RealmID, player: row.PlayerGuid, instance: row.InstanceName,
						boss: row.EncounterName, difficulty: row.DifficultyName, class: row.PlayerClass,
						spec: row.PlayerSpec, subSpec: row.PlayerSubSpec, metric: metric, size: row.MaxPlayers}
					entry := observations[key]
					if entry == nil {
						entry = &scoredEvidence{}
						observations[key] = entry
					}
					if row.RawValue > entry.bestRaw {
						entry.bestRaw = row.RawValue
					}
					if !row.KilledAt.Time.Before(periodStart) {
						if row.RawValue > entry.periodRaw {
							entry.periodRaw = row.RawValue
						}
						if row.HasLockedParse {
							entry.parses = append(entry.parses, ParseObservation{Score: row.LockedParse, KilledAt: row.KilledAt.Time, ID: row.RunID.String()})
						}
					}
				}
			}
			if len(ids) < int(pageSize) {
				break
			}
			after = ids[len(ids)-1]
		}
		for key, entry := range observations {
			cohort := key
			cohort.realm = uuid.Nil
			cohort.player = ""
			for _, window := range []struct {
				name string
				raw  float64
				rank float64
			}{
				{"all_time", entry.bestRaw, rankOne[cohort]},
				{"period", entry.periodRaw, rankOne[func() scoredKey { c := cohort; c.metric += ":period:" + periodStart.Format(time.RFC3339Nano); return c }()]},
			} {
				if window.raw <= 0 || window.rank <= 0 {
					continue
				}
				score, err := Peak(window.raw, window.rank)
				if err != nil {
					return generation, written, err
				}
				row := ratingScoreParams(generation.ID, tenant, group, key, "peak", window.name, score, asOf, periodStart)
				row.BestRaw = pgtype.Float8{Float64: window.raw, Valid: true}
				row.RankOneRaw = pgtype.Float8{Float64: window.rank, Valid: true}
				if err := store.InsertRatingBossScore(ctx, row); err != nil {
					return generation, written, err
				}
				written++
				track(key, "peak", window.name, score)
			}
			if len(entry.parses) == 0 {
				continue
			}
			mastery, err := ScoreMastery(entry.parses, MasteryPolicy{
				HalfLife:   time.Duration(policy.HalfLifeDays * float64(24*time.Hour)),
				BestWeight: policy.BestWeight, FormWeight: policy.FormWeight, FloorWeight: policy.FloorWeight,
				RankWeight: func(n int) float64 {
					if n >= int(policy.FullRankKills) || policy.FullRankKills == 1 {
						return 1
					}
					return policy.RankOneWeight + (1-policy.RankOneWeight)*float64(n-1)/float64(policy.FullRankKills-1)
				},
			})
			if err != nil {
				return generation, written, err
			}
			for _, value := range []struct {
				metric string
				score  float64
			}{{"mastery", mastery.Mastery}, {"ranked_mastery", mastery.Ranked}} {
				row := ratingScoreParams(generation.ID, tenant, group, key, value.metric, "period", value.score, asOf, periodStart)
				row.BestLockedParse = pgtype.Float8{Float64: mastery.Best, Valid: true}
				row.Form = pgtype.Float8{Float64: mastery.Form, Valid: true}
				row.FloorScore = pgtype.Float8{Float64: mastery.Floor, Valid: true}
				row.EligibleKills = int32(mastery.EligibleKills)
				if err := store.InsertRatingBossScore(ctx, row); err != nil {
					return generation, written, err
				}
				written++
				track(key, value.metric, "period", value.score)
			}
		}
		totals := make(map[renownKey]*renownTotals)
		for cursorTime, cursorID := time.Date(1, 1, 1, 0, 0, 0, 0, time.UTC), uuid.Nil; ; {
			rows, err := store.ListGroupRenownFacts(ctx, database.ListGroupRenownFactsParams{
				TenantID: tenant, GroupID: group,
				WindowEnd: database.Timestamptz(asOf), AfterKilledAt: database.Timestamptz(cursorTime),
				AfterID: cursorID, BatchSize: pageSize,
			})
			if err != nil {
				return generation, written, err
			}
			if facts+len(rows) > limits.MaxFacts {
				return generation, written, fmt.Errorf("renown fact safety bound exceeded")
			}
			for _, fact := range rows {
				facts++
				boss, ok := manifest[BossKey{Instance: fact.InstanceName, Encounter: fact.EncounterName}]
				if !ok {
					continue
				}
				key := renownKey{realm: fact.RealmID, player: fact.PlayerGuid, instance: fact.InstanceName, boss: fact.EncounterName}
				entry := totals[key]
				if entry == nil {
					entry = &renownTotals{}
					totals[key] = entry
				}
				points, err := RenownAward(boss.RenownPoints, boss.FinalBossBonus, boss.FinalBossBonus > 0)
				if err != nil {
					return generation, written, err
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
		for key, value := range totals {
			for _, window := range []struct {
				kind   string
				points float64
				kills  int32
			}{
				{"career", value.career, value.careerKills}, {"period", value.period, value.periodKills},
			} {
				if window.kills == 0 {
					continue
				}
				scored := scoredKey{realm: key.realm, player: key.player, instance: key.instance, boss: key.boss, metric: "none"}
				row := ratingScoreParams(generation.ID, tenant, group, scored, "renown", window.kind, window.points, asOf, periodStart)
				row.EligibleKills = window.kills
				if err := store.InsertRatingBossScore(ctx, row); err != nil {
					return generation, written, err
				}
				written++
				track(scored, "renown", window.kind, window.points)
			}
		}
		scopesWritten, err := writeRatingScopes(ctx, store, generation.ID, tenant, group, scopeEvidence, bosses, raids)
		if err != nil {
			return generation, written, err
		}
		written += scopesWritten
		guildWritten, err := buildGuildGroup(ctx, store, generation.ID, tenant, group, policy, bosses, raids, asOf, limits, fastest, &guildFacts)
		if err != nil {
			return generation, written, err
		}
		written += guildWritten
	}
	return generation, written, nil
}

func ratingScoreParams(generation, tenant, group uuid.UUID, key scoredKey, metric, window string, score float64, asOf, start time.Time) database.InsertRatingBossScoreParams {
	row := database.InsertRatingBossScoreParams{
		GenerationID: generation, TenantID: tenant, GroupID: uuid.NullUUID{UUID: group, Valid: true},
		RealmID: key.realm, PlayerGuid: key.player, InstanceName: key.instance, EncounterName: key.boss,
		DifficultyName: key.difficulty, MaxPlayers: key.size, PlayerClass: key.class, PlayerSpec: key.spec,
		PlayerSubSpec: key.subSpec, PerformanceMetric: key.metric, RatingMetric: metric, WindowKind: window, Score: score,
	}
	if window == "period" {
		row.WindowStart = database.Timestamptz(start)
		row.WindowEnd = database.Timestamptz(asOf)
	}
	return row
}

// PublishTenantRatings retires the old generation and activates the fully
// built replacement in one transaction. A stale or failed build stays hidden.
func PublishTenantRatings(ctx context.Context, store database.Store, tenant, generation uuid.UUID) error {
	return store.InTx(ctx, func(tx database.Store) error {
		if err := tx.RetireActiveRatingScoreGeneration(ctx, tenant); err != nil {
			return err
		}
		updated, err := tx.ActivateRatingScoreGeneration(ctx, database.ActivateRatingScoreGenerationParams{TenantID: tenant, GenerationID: generation})
		if err != nil {
			return err
		}
		if updated != 1 {
			return fmt.Errorf("rating generation %s is not building for tenant %s", generation, tenant)
		}
		_, err = tx.DeleteRetiredRatingGeneration(ctx, tenant)
		return err
	}, nil)
}
