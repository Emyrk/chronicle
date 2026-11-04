package ratingmath

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// RefreshEvolvingTenantMastery applies one bounded dirty page to generation-free tenant scores.
func RefreshEvolvingTenantMastery(ctx context.Context, store database.Store, tenant uuid.UUID, now time.Time) (int, error) {
	var processed int
	err := store.InTx(ctx, func(tx database.Store) error {
		manifest, err := currentEvolvingTenantRatingPolicy(ctx, tx, tenant)
		if err != nil {
			return err
		}
		policy := manifest.Policy.masteryPolicy()
		keys, err := tx.LockDirtyMasterySubjects(ctx, database.LockDirtyMasterySubjectsParams{TenantID: tenant, BatchSize: liveMasteryPageSize})
		if err != nil {
			return err
		}
		for _, key := range keys {
			if err := evolvingRefreshLiveMasterySubject(ctx, tx, policy, key, now); err != nil {
				return err
			}
			n, err := tx.DeleteDirtyMasterySubjectIfRevision(ctx, database.DeleteDirtyMasterySubjectIfRevisionParams(key))
			if err != nil {
				return err
			}
			if n != 1 {
				return fmt.Errorf("mastery subject changed during refresh")
			}
			processed++
		}
		return nil
	}, nil)
	if err != nil {
		return 0, err
	}
	return processed, nil
}

func evolvingRefreshLiveMasterySubject(ctx context.Context, tx database.Store,
	policy database.RatingGroupPolicy, key database.LockDirtyMasterySubjectsRow, now time.Time) error {
	guildID := uuid.Nil
	if key.SubjectKind == "guild" {
		var err error
		guildID, err = uuid.Parse(key.SubjectID)
		if err != nil {
			return fmt.Errorf("invalid guild mastery key: %w", err)
		}
	} else if key.SubjectKind != "player" {
		return fmt.Errorf("invalid mastery kind %q", key.SubjectKind)
	}
	rows, err := tx.CalculateLiveMasterySubject(ctx, database.CalculateLiveMasterySubjectParams{
		SubjectKind: key.SubjectKind, TenantID: key.TenantID, RealmID: key.RealmID,
		SubjectID: key.SubjectID, GuildID: guildID, InstanceName: key.InstanceName,
		EncounterName: key.EncounterName, DifficultyName: key.DifficultyName,
		MaxPlayers: key.MaxPlayers, PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
		PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		AsOf:         database.Timestamptz(now),
		AllTimeStart: database.Timestamptz(time.Date(2, 1, 1, 0, 0, 0, 0, time.UTC)),
		PeriodStart:  database.Timestamptz(now.AddDate(0, 0, -180)),
	})
	if err != nil {
		return err
	}
	if len(rows) != 2 {
		return fmt.Errorf("mastery subject returned %d windows", len(rows))
	}
	if key.SubjectKind == "player" {
		err = tx.EvolvingDeletePlayerLiveMasteryScores(ctx, database.EvolvingDeletePlayerLiveMasteryScoresParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			SubjectID: key.SubjectID, InstanceName: key.InstanceName, EncounterName: key.EncounterName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		})
	} else {
		err = tx.EvolvingDeleteGuildLiveMasteryScores(ctx, database.EvolvingDeleteGuildLiveMasteryScoresParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guildID, InstanceName: key.InstanceName, EncounterName: key.EncounterName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
		})
	}
	if err != nil {
		return err
	}
	for _, row := range rows {
		result, err := masteryResultFromSummary(policy, key.InstanceName, key.EncounterName,
			row.EligibleKills, row.ExcludedKills, row.Best, row.FloorScore, row.FormScore)
		if err != nil {
			return err
		}
		for _, metric := range []struct {
			name  string
			score float64
		}{
			{"mastery", result.Mastery}, {"ranked_mastery", result.Ranked},
		} {
			if result.EligibleKills != 0 {
				if err := evolvingInsertLiveMasteryScore(ctx, tx, guildID, key, row, metric.name, metric.score); err != nil {
					return err
				}
			}
			if err := evolvingRefreshLiveMasteryScope(ctx, tx, guildID, key, row,
				metric.name); err != nil {
				return err
			}
		}
	}
	return nil
}

func evolvingInsertLiveMasteryScore(ctx context.Context, tx database.Store, guildID uuid.UUID,
	key database.LockDirtyMasterySubjectsRow, row database.CalculateLiveMasterySubjectRow,
	metric string, score float64) error {
	var n int64
	var err error
	if key.SubjectKind == "player" {
		n, err = tx.EvolvingInsertPlayerLiveMasteryScore(ctx, database.EvolvingInsertPlayerLiveMasteryScoreParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			SubjectID: key.SubjectID, InstanceName: key.InstanceName,
			EncounterName: key.EncounterName, DifficultyName: key.DifficultyName,
			MaxPlayers: key.MaxPlayers, PlayerClass: key.PlayerClass,
			PlayerSpec: key.PlayerSpec, PlayerSubSpec: key.PlayerSubSpec,
			PerformanceMetric: key.PerformanceMetric, RatingMetric: metric,
			WindowKind: row.WindowKind, WindowStart: row.WindowStart, WindowEnd: row.WindowEnd,
			Score: score, Best: row.Best.Float64, Form: row.FormScore.Float64,
			Floor: row.FloorScore.Float64, EligibleKills: int32(row.EligibleKills),
		})
	} else {
		n, err = tx.EvolvingInsertGuildLiveMasteryScore(ctx, database.EvolvingInsertGuildLiveMasteryScoreParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guildID, InstanceName: key.InstanceName,
			EncounterName: key.EncounterName, DifficultyName: key.DifficultyName,
			MaxPlayers: key.MaxPlayers, RatingMetric: metric, WindowKind: row.WindowKind,
			WindowStart: row.WindowStart, WindowEnd: row.WindowEnd, Score: score,
			Best: row.Best.Float64, Form: row.FormScore.Float64,
			Floor: row.FloorScore.Float64, EligibleKills: int32(row.EligibleKills),
		})
	}
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("active %s mastery score rejected", key.SubjectKind)
	}
	return nil
}

func evolvingRefreshLiveMasteryScope(ctx context.Context, tx database.Store, guildID uuid.UUID,
	key database.LockDirtyMasterySubjectsRow, row database.CalculateLiveMasterySubjectRow,
	metric string) error {
	var bosses []tenantScopeBoss
	if key.SubjectKind == "player" {
		if err := tx.EvolvingDeletePlayerLiveMasteryScope(ctx, database.EvolvingDeletePlayerLiveMasteryScopeParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			SubjectID: key.SubjectID, InstanceName: key.InstanceName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
			RatingMetric: metric, WindowKind: row.WindowKind,
		}); err != nil {
			return err
		}
		scored, err := tx.EvolvingListTenantPlayerRaidBosses(ctx, database.EvolvingListTenantPlayerRaidBossesParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			PlayerGuid: key.SubjectID, InstanceName: key.InstanceName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
			RatingMetric: metric, WindowKind: row.WindowKind,
		})
		if err != nil {
			return err
		}
		if len(scored) > 200 {
			return errors.New("too many player Mastery raid bosses")
		}
		for _, boss := range scored {
			bosses = append(bosses, tenantScopeBoss{
				instance: key.InstanceName, encounter: boss.EncounterName, score: boss.Score,
			})
		}
	} else {
		if err := tx.EvolvingDeleteGuildLiveMasteryScope(ctx, database.EvolvingDeleteGuildLiveMasteryScopeParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guildID, InstanceName: key.InstanceName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			RatingMetric: metric, WindowKind: row.WindowKind,
		}); err != nil {
			return err
		}
		scored, err := tx.EvolvingListTenantGuildRaidBosses(ctx, database.EvolvingListTenantGuildRaidBossesParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guildID, InstanceName: key.InstanceName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			RatingMetric: metric, WindowKind: row.WindowKind,
		})
		if err != nil {
			return err
		}
		if len(scored) > 200 {
			return errors.New("too many guild Mastery raid bosses")
		}
		for _, boss := range scored {
			bosses = append(bosses, tenantScopeBoss{
				instance: key.InstanceName, encounter: boss.EncounterName, score: boss.Score,
			})
		}
	}
	if len(bosses) == 0 {
		return nil
	}
	scopes, err := tenantScopeScores(metric, bosses)
	if err != nil {
		return err
	}
	score, ok := scopes[key.InstanceName]
	if !ok {
		return errors.New("mastery raid scope missing")
	}
	var n int64
	if key.SubjectKind == "player" {
		n, err = tx.EvolvingInsertPlayerLiveMasteryScope(ctx, database.EvolvingInsertPlayerLiveMasteryScopeParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			SubjectID: key.SubjectID, InstanceName: key.InstanceName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
			RatingMetric: metric, WindowKind: row.WindowKind,
			WindowStart: row.WindowStart, WindowEnd: row.WindowEnd, Score: score,
		})
	} else {
		n, err = tx.EvolvingInsertGuildLiveMasteryScope(ctx, database.EvolvingInsertGuildLiveMasteryScopeParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guildID, InstanceName: key.InstanceName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			RatingMetric: metric, WindowKind: row.WindowKind,
			WindowStart: row.WindowStart, WindowEnd: row.WindowEnd, Score: score,
		})
	}
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("active %s mastery scope rejected", key.SubjectKind)
	}
	return nil
}
