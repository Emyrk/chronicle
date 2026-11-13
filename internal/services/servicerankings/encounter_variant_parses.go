package servicerankings

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type variantParsesQuerier interface {
	GetParseVariantMembershipCohort(context.Context, database.GetParseVariantMembershipCohortParams) ([]float64, error)
	ListParseVariantResultsForInstance(context.Context, database.ListParseVariantResultsForInstanceParams) ([]database.ParseVariantResult, error)
}

// The complete SQL parameter struct is the cache key, including metric, variant,
// difficulty, size, excluded run, tenant, window and spec. These caches are local
// to a single request/transaction and never outlive their database view.
type variantCohortCache map[database.GetParseVariantMembershipCohortParams][]float64

func variantCohortParams(tid uuid.UUID, ranking database.ListRankingsForInstanceRow, metric string, mode parsepolicy.CohortMode, cutoff, start pgtype.Timestamptz) database.GetParseVariantMembershipCohortParams {
	return database.GetParseVariantMembershipCohortParams{
		TenantID: tid, Metric: metric, PolicyVersion: int16(parsepolicy.PolicyVersion), QueryVersion: int16(QueryVersion),
		Cutoff: cutoff, WindowStart: start, ExcludeRunID: ranking.RunID,
		EncounterName: ranking.EncounterName, DifficultyName: ranking.DifficultyName, MaxPlayers: ranking.MaxPlayers,
		EncounterVariant: ranking.EncounterVariant.String,
		PlayerClass:      ranking.PlayerClass, PlayerSpec: ranking.PlayerSpec, PlayerSubSpec: ranking.PlayerSubSpec, CohortMode: string(mode),
	}
}

func (cache variantCohortCache) score(ctx context.Context, store interface {
	GetParseVariantMembershipCohort(context.Context, database.GetParseVariantMembershipCohortParams) ([]float64, error)
}, params database.GetParseVariantMembershipCohortParams, value float64) (parsepolicy.ScoreResult, error) {
	cohort, ok := cache[params]
	if !ok {
		var err error
		cohort, err = store.GetParseVariantMembershipCohort(ctx, params)
		if err != nil {
			return parsepolicy.ScoreResult{}, fmt.Errorf("load %s %s variant cohort: %w", params.Metric, params.EncounterVariant, err)
		}
		cache[params] = cohort
	}
	result, valid := parsepolicy.Score(cohort, value)
	if !valid && result.Status != parsepolicy.StatusSampleTooSmall {
		return parsepolicy.ScoreResult{}, fmt.Errorf("invalid %s %s variant score inputs", params.Metric, params.EncounterVariant)
	}
	return result, nil
}

func persistVariantParses(ctx context.Context, store database.Store, tid, instanceID uuid.UUID, rankings []database.ListRankingsForInstanceRow, cutoff, start pgtype.Timestamptz, mode parsepolicy.CohortMode) error {
	cache := make(variantCohortCache)
	for _, ranking := range rankings {
		if !ranking.EncounterVariant.Valid {
			continue
		}
		for _, metric := range []struct {
			name  string
			value float64
		}{{"dps", ranking.Dps}, {"hps", ranking.Hps}} {
			if metric.value <= 0 {
				continue
			}
			score, err := cache.score(ctx, store, variantCohortParams(tid, ranking, metric.name, mode, cutoff, start), metric.value)
			if err != nil {
				return err
			}
			if err := store.InsertParseVariantResult(ctx, database.InsertParseVariantResultParams{
				TenantID: tid, InstanceID: instanceID, EncounterName: ranking.EncounterName,
				DifficultyName: ranking.DifficultyName, MaxPlayers: ranking.MaxPlayers, EncounterVariant: ranking.EncounterVariant.String,
				PlayerGuid: ranking.PlayerGuid, Metric: metric.name, PreciseScore: score.PreciseScore,
				DisplayScore: int16(score.DisplayScore), Rank: int32(score.Rank), SampleSize: int32(score.SampleSize), Status: string(score.Status),
			}); err != nil {
				return fmt.Errorf("persist variant parse: %w", err)
			}
		}
	}
	return nil
}

type variantParseKey struct {
	player, encounter, difficulty string
	size                          int16
	variant                       string
}

// applyVariantParses is used only by the individual raid response, never career
// or Combined aggregate readers. Unknown encounters retain their original score.
// Historical variant results are immutable when present. Older known encounters
// without this additive projection can be scored on demand without rewriting
// their Combined history.
func applyVariantParses(ctx context.Context, store variantParsesQuerier, tid, instanceID uuid.UUID, rankings []database.ListRankingsForInstanceRow, players []chroniclesdk.InstanceParsePlayer, encounters []string, metric parsepolicy.Metric, mode parsepolicy.CohortMode, cutoff, start pgtype.Timestamptz, historical bool) error {
	// Match the handler's first (highest-DPS) ranking selection, including
	// unclassified rows. A later classified row must not relabel an unknown one.
	type rankingKey struct {
		player, encounter, difficulty string
		size                          int16
	}
	selected := make(map[rankingKey]database.ListRankingsForInstanceRow)
	anyKnown := false
	for _, ranking := range rankings {
		key := rankingKey{ranking.PlayerGuid, ranking.EncounterName, ranking.DifficultyName, ranking.MaxPlayers}
		if _, exists := selected[key]; !exists {
			selected[key] = ranking
			anyKnown = anyKnown || ranking.EncounterVariant.Valid
		}
	}
	if !anyKnown {
		return nil
	}
	persisted := make(map[variantParseKey]database.ParseVariantResult)
	if historical {
		rows, err := store.ListParseVariantResultsForInstance(ctx, database.ListParseVariantResultsForInstanceParams{TenantID: tid, InstanceID: instanceID, Metric: string(metric)})
		if err != nil {
			return fmt.Errorf("read variant parses: %w", err)
		}
		for _, row := range rows {
			persisted[variantParseKey{row.PlayerGuid, row.EncounterName, row.DifficultyName, row.MaxPlayers, row.EncounterVariant}] = row
		}
	}
	cache := make(variantCohortCache)
	for i := range players {
		player := &players[i]
		changed := false
		for j := range player.Bosses {
			boss := &player.Bosses[j]
			ranking, found := selected[rankingKey{player.PlayerGUID, boss.EncounterName, boss.DifficultyName, boss.MaxPlayers}]
			if !found || !ranking.EncounterVariant.Valid {
				continue
			}
			key := variantParseKey{player.PlayerGUID, boss.EncounterName, boss.DifficultyName, boss.MaxPlayers, ranking.EncounterVariant.String}
			changed = true
			variant := ranking.EncounterVariant.String
			boss.EncounterVariant = &variant
			// Never relabel a Combined result as an exact variant. Even when this
			// row cannot be scored, discard its previous score and average input.
			boss.PreciseScore, boss.DisplayScore, boss.Rank, boss.SampleSize = 0, 0, 0, 0
			boss.Status = string(parsepolicy.StatusSampleTooSmall)
			if mode == parsepolicy.CohortModeSpec && isUnknownPlayerSpec(ranking.PlayerSpec) {
				boss.Status = string(parsepolicy.ReasonUnknownSpec)
				continue
			}
			if boss.MetricValue <= 0 {
				continue
			}
			score := parsepolicy.ScoreResult{}
			if saved, ok := persisted[key]; ok {
				score = parsepolicy.ScoreResult{PreciseScore: saved.PreciseScore, DisplayScore: int(saved.DisplayScore), Rank: int(saved.Rank), SampleSize: int(saved.SampleSize), Status: parsepolicy.Status(saved.Status)}
			} else {
				var err error
				score, err = cache.score(ctx, store, variantCohortParams(tid, ranking, string(metric), mode, cutoff, start), boss.MetricValue)
				if err != nil {
					return err
				}
			}
			boss.PreciseScore, boss.DisplayScore, boss.Rank, boss.SampleSize, boss.Status = score.PreciseScore, score.DisplayScore, score.Rank, score.SampleSize, string(score.Status)
		}
		if !changed {
			continue
		}
		scores := make([]float64, 0, len(player.Bosses))
		for _, boss := range player.Bosses {
			if boss.Status == string(parsepolicy.StatusOK) || boss.Status == string(parsepolicy.StatusLowConfidence) {
				scores = append(scores, boss.PreciseScore)
			}
		}
		player.AverageParse = nil
		if avg, ok := parsepolicy.AverageParse(scores, len(selectedInstanceBosses(rankings, encounters))); ok {
			player.AverageParse = &chroniclesdk.InstanceParseAverage{PreciseScore: avg.PreciseScore, DisplayScore: avg.DisplayScore, Killed: avg.Killed, Selected: avg.Selected}
		}
	}
	return nil
}
