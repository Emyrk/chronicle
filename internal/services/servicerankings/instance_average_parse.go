package servicerankings

import (
	"context"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/wowspec"
)

// InstanceParsesStore is the subset of database.Store InstanceAverageParse
// reads.
type InstanceParsesStore interface {
	persistedParsesQuerier
	GetTenantByID(ctx context.Context, id uuid.UUID) (database.Tenant, error)
	IsLogInstanceInvalid(ctx context.Context, id uuid.UUID) (bool, error)
	GetLogInstanceStartTime(ctx context.Context, id uuid.UUID) (pgtype.Timestamptz, error)
	ListRankingsForInstance(ctx context.Context, instanceID uuid.UUID) ([]database.ListRankingsForInstanceRow, error)
}

// InstanceAverageParse is the raid-wide average parse for the instance parses
// endpoint's default view (historical, default lookback, every encounter):
// the mean of each player's average parse, taken from the HPS view for
// healers and the DPS view for everyone else, so each player counts once.
//
// It reads persisted results only and never scores on demand. ok is false
// when that view would show no persisted parses: an invalid instance,
// cohort_mode=disabled, a tenant lookback override, no start time, missing
// or incomplete persisted results, or nobody with a scored boss.
func InstanceAverageParse(ctx context.Context, store InstanceParsesStore, instanceID uuid.UUID) (int, bool, error) {
	view, ok, err := loadDefaultInstanceParsesView(ctx, store, instanceID)
	if err != nil || !ok {
		return 0, false, err
	}
	encounterNames := instanceEncounterNames(view.rankings)

	views := map[parsepolicy.Metric]map[string]chroniclesdk.InstanceParsePlayer{}
	for _, metric := range []parsepolicy.Metric{parsepolicy.MetricDPS, parsepolicy.MetricHPS} {
		persisted, err := loadPersistedInstanceParses(ctx, store, view.tid, instanceID, view.rankings, encounterNames, metric, view.config.cohortMode)
		if err != nil {
			return 0, false, err
		}
		if !persisted.complete {
			continue // nil view: fatal only when a player needs it
		}
		byGUID := make(map[string]chroniclesdk.InstanceParsePlayer, len(persisted.players))
		for _, player := range persisted.players {
			byGUID[player.PlayerGUID] = player
		}
		views[metric] = byGUID
	}

	// The DPS view's player role is the endpoint's role for that player.
	dpsView, hpsView := views[parsepolicy.MetricDPS], views[parsepolicy.MetricHPS]
	if dpsView == nil {
		return 0, false, nil
	}
	var sum float64
	var players int
	for guid, player := range dpsView {
		if player.PlayerRole == string(wowspec.RoleHeal) {
			if hpsView == nil {
				return 0, false, nil
			}
			player = hpsView[guid]
		}
		if player.AverageParse == nil {
			continue
		}
		sum += player.AverageParse.PreciseScore
		players++
	}
	if players == 0 {
		return 0, false, nil
	}
	return parsepolicy.RoundDisplay(sum / float64(players)), true, nil
}

// defaultInstanceParsesView is what the instance parses endpoint's default
// view (historical, default lookback) reads before loading persisted results.
type defaultInstanceParsesView struct {
	tid      uuid.UUID
	config   instanceParseTenantConfig
	rankings []database.ListRankingsForInstanceRow
}

// loadDefaultInstanceParsesView applies the endpoint's rules for the default
// view. ok is false when it would show no persisted parses: an invalid
// instance, cohort_mode=disabled, a tenant lookback override or no start time.
func loadDefaultInstanceParsesView(ctx context.Context, store InstanceParsesStore, instanceID uuid.UUID) (defaultInstanceParsesView, bool, error) {
	invalid, err := store.IsLogInstanceInvalid(ctx, instanceID)
	if err != nil || invalid {
		return defaultInstanceParsesView{}, false, err
	}
	tid := servicetenant.TenantIDFromContext(ctx)
	config := loadInstanceParseTenantConfig(ctx, store, tid)
	if config.cohortMode == parsepolicy.CohortModeDisabled {
		return defaultInstanceParsesView{}, false, nil
	}
	if config.lookbackDays != nil && parsepolicy.LookbackDays(*config.lookbackDays) != parsepolicy.DefaultLookbackDays {
		return defaultInstanceParsesView{}, false, nil
	}
	startTime, err := store.GetLogInstanceStartTime(ctx, instanceID)
	if err != nil || !startTime.Valid {
		return defaultInstanceParsesView{}, false, err
	}
	rankings, err := store.ListRankingsForInstance(ctx, instanceID)
	if err != nil {
		return defaultInstanceParsesView{}, false, err
	}
	return defaultInstanceParsesView{tid: tid, config: config, rankings: rankings}, true, nil
}

// instanceEncounterNames is every encounter in the instance's rankings,
// sorted: the endpoint's selection when no encounter_names are given.
func instanceEncounterNames(rankings []database.ListRankingsForInstanceRow) []string {
	seen := make(map[string]struct{})
	names := make([]string, 0)
	for _, ranking := range rankings {
		if _, ok := seen[ranking.EncounterName]; !ok {
			seen[ranking.EncounterName] = struct{}{}
			names = append(names, ranking.EncounterName)
		}
	}
	sort.Strings(names)
	return names
}
