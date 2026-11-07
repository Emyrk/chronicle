package servicerankings

import (
	"context"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/wowspec"
)

// BossParse is one player's parse on one boss of an instance.
type BossParse struct {
	// Metric is hps for a healer on that boss, dps for everyone else.
	Metric parsepolicy.Metric
	// Score is the display score (0-100).
	Score int
	// Rank is the 1-based position in a cohort of SampleSize kills.
	Rank       int
	SampleSize int
}

// InstanceBossParse is playerGUID's parse on encounterName as the instance
// parses endpoint's default view shows it, under the same rules as
// InstanceAverageParse: persisted results only (the receipt's when there is
// one), the HPS view when that view calls the player a healer, else DPS.
//
// ok is false when the page would show no parse for that boss: the view
// shows no persisted parses, the player has no row for the boss, or the boss
// isn't scored (cohort too small, unknown spec, no metric value).
func InstanceBossParse(ctx context.Context, store InstanceParsesStore, instanceID uuid.UUID, playerGUID, encounterName string) (BossParse, bool, error) {
	view, ok, err := loadDefaultInstanceParsesView(ctx, store, instanceID)
	if err != nil || !ok {
		return BossParse{}, false, err
	}
	load := func(metric parsepolicy.Metric) (*chroniclesdk.InstanceParsePlayer, error) {
		persisted, err := loadPersistedInstanceParses(ctx, store, view.tid, instanceID, view.rankings, []string{encounterName}, metric, view.config.cohortMode)
		if err != nil || !persisted.complete {
			return nil, err
		}
		for i := range persisted.players {
			if persisted.players[i].PlayerGUID == playerGUID {
				return &persisted.players[i], nil
			}
		}
		return nil, nil
	}

	metric := parsepolicy.MetricDPS
	player, err := load(metric)
	if err != nil || player == nil {
		return BossParse{}, false, err
	}
	// The DPS view's player role is the endpoint's role for that player.
	if player.PlayerRole == string(wowspec.RoleHeal) {
		metric = parsepolicy.MetricHPS
		if player, err = load(metric); err != nil || player == nil {
			return BossParse{}, false, err
		}
	}
	for _, boss := range player.Bosses {
		if boss.EncounterName != encounterName {
			continue
		}
		if boss.Status != string(parsepolicy.StatusOK) && boss.Status != string(parsepolicy.StatusLowConfidence) {
			return BossParse{}, false, nil
		}
		return BossParse{Metric: metric, Score: boss.DisplayScore, Rank: boss.Rank, SampleSize: boss.SampleSize}, true, nil
	}
	return BossParse{}, false, nil
}
