package ratingmath

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const liveMasteryPageSize int32 = 16

// RefreshDirtyTenantMastery replays both windows for each exact subject key.
// The active-generation and tenant-revision locks fence full rebuild swaps;
// dirty keys remain queued while a frozen rebuild is building.
func RefreshDirtyTenantMastery(ctx context.Context, store database.Store, tenant uuid.UUID, now time.Time) (int, error) {
	var processed int
	err := store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.LockTenantRatingRevision(ctx, tenant); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			return err
		}
		building, err := tx.TenantRatingGenerationBuilding(ctx, tenant)
		if err != nil {
			return err
		}
		if building {
			return nil
		}
		ready, err := tx.TenantLiveEvidenceReady(ctx, tenant)
		if err != nil {
			return err
		}
		if !ready {
			return nil // A partial historical corpus must never replace full-rebuild scores.
		}
		generation, err := tx.LockActiveTenantRatingGeneration(ctx, tenant)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		checkpoint, err := tx.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{
			TenantID: tenant, GenerationID: generation,
		})
		if err != nil {
			return err
		}
		policy, err := tenantMasteryPolicy(checkpoint, tenant)
		if err != nil {
			return err
		}
		keys, err := tx.LockDirtyMasterySubjects(ctx, database.LockDirtyMasterySubjectsParams{TenantID: tenant, BatchSize: liveMasteryPageSize})
		if err != nil {
			return err
		}
		for _, key := range keys {
			if err := refreshLiveMasterySubject(ctx, tx, generation, policy, key, now); err != nil {
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

func refreshLiveMasterySubject(ctx context.Context, tx database.Store, generation uuid.UUID,
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
		err = tx.DeletePlayerLiveMasteryScores(ctx, database.DeletePlayerLiveMasteryScoresParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
			SubjectID: key.SubjectID, InstanceName: key.InstanceName, EncounterName: key.EncounterName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
		})
	} else {
		err = tx.DeleteGuildLiveMasteryScores(ctx, database.DeleteGuildLiveMasteryScoresParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
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
				if err := insertLiveMasteryScore(ctx, tx, generation, guildID, key, row, metric.name, metric.score); err != nil {
					return err
				}
			}
			if err := refreshLiveMasteryScope(ctx, tx, generation, guildID, key, row,
				metric.name); err != nil {
				return err
			}
		}
	}
	return nil
}

func insertLiveMasteryScore(ctx context.Context, tx database.Store, generation, guildID uuid.UUID,
	key database.LockDirtyMasterySubjectsRow, row database.CalculateLiveMasterySubjectRow,
	metric string, score float64) error {
	var n int64
	var err error
	if key.SubjectKind == "player" {
		n, err = tx.InsertPlayerLiveMasteryScore(ctx, database.InsertPlayerLiveMasteryScoreParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
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
		n, err = tx.InsertGuildLiveMasteryScore(ctx, database.InsertGuildLiveMasteryScoreParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
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

func refreshLiveMasteryScope(ctx context.Context, tx database.Store, generation, guildID uuid.UUID,
	key database.LockDirtyMasterySubjectsRow, row database.CalculateLiveMasterySubjectRow,
	metric string) error {
	var bosses []tenantScopeBoss
	if key.SubjectKind == "player" {
		if err := tx.DeletePlayerLiveMasteryScope(ctx, database.DeletePlayerLiveMasteryScopeParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
			SubjectID: key.SubjectID, InstanceName: key.InstanceName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
			RatingMetric: metric, WindowKind: row.WindowKind,
		}); err != nil {
			return err
		}
		scored, err := tx.ListTenantPlayerRaidBosses(ctx, database.ListTenantPlayerRaidBossesParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
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
		if err := tx.DeleteGuildLiveMasteryScope(ctx, database.DeleteGuildLiveMasteryScopeParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guildID, InstanceName: key.InstanceName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			RatingMetric: metric, WindowKind: row.WindowKind,
		}); err != nil {
			return err
		}
		scored, err := tx.ListTenantGuildRaidBosses(ctx, database.ListTenantGuildRaidBossesParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
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
		n, err = tx.InsertPlayerLiveMasteryScope(ctx, database.InsertPlayerLiveMasteryScopeParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
			SubjectID: key.SubjectID, InstanceName: key.InstanceName,
			DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
			RatingMetric: metric, WindowKind: row.WindowKind,
			WindowStart: row.WindowStart, WindowEnd: row.WindowEnd, Score: score,
		})
	} else {
		n, err = tx.InsertGuildLiveMasteryScope(ctx, database.InsertGuildLiveMasteryScopeParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
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
