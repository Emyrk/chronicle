package ratingmath

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const tenantMasteryPageSize int32 = 16

// TenantMasteryStageStep computes a bounded page of staged Mastery subjects in
// PostgreSQL, writes both windows and metrics in batches, and advances the
// frozen rebuild checkpoint in the same transaction.
func TenantMasteryStageStep(ctx context.Context, store database.Store, tenant, generation uuid.UUID) error {
	cp, err := store.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: tenant, GenerationID: generation})
	if err != nil {
		return err
	}
	if cp.Phase != "mastery_pending" {
		return fmt.Errorf("unexpected mastery phase %q", cp.Phase)
	}
	revision, err := store.GetRatingConfigRevision(ctx, tenant)
	if err != nil {
		return err
	}
	if revision != cp.ConfigRevision {
		return ErrRatingConfigStale
	}
	policy, err := tenantMasteryPolicy(cp, tenant)
	if err != nil {
		return err
	}
	var cursor projectionCursor
	if err := json.Unmarshal(cp.Cursor, &cursor); err != nil {
		return fmt.Errorf("invalid mastery cursor: %w", err)
	}
	kind := cursor.Rating
	if kind == "" {
		kind = "player"
	}
	if kind != "player" && kind != "guild" {
		return fmt.Errorf("invalid mastery kind %q", kind)
	}
	// A deployment may encounter a generation whose old streaming writer has
	// completed the all-time window but not the period window. Finish that one
	// checkpoint with the old replay path, then all later pages use set-based SQL.
	if cursor.Window != "" {
		if cursor.Window != "period" {
			return fmt.Errorf("invalid mastery window cursor %q", cursor.Window)
		}
		return finishLegacyTenantMasteryPeriod(ctx, store, cp, policy, cursor, kind)
	}

	return store.InTx(ctx, func(tx database.Store) error {
		current, err := tx.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: tenant, GenerationID: generation})
		if err != nil {
			return err
		}
		if current.Phase != "mastery_pending" || !bytes.Equal(current.Cursor, cp.Cursor) ||
			!current.AsOf.Valid || !current.AsOf.Time.Equal(cp.AsOf.Time) {
			return ErrMasteryCheckpointChanged
		}
		currentRevision, err := tx.GetRatingConfigRevision(ctx, tenant)
		if err != nil {
			return err
		}
		if currentRevision != current.ConfigRevision {
			return ErrRatingConfigStale
		}
		allTimeStart := time.Date(2, 1, 1, 0, 0, 0, 0, time.UTC)
		periodStart := current.AsOf.Time.AddDate(0, 0, -int(policy.PeriodDays))
		if kind == "player" {
			rows, err := tx.CalculateTenantPlayerMasteryPage(ctx, database.CalculateTenantPlayerMasteryPageParams{
				GenerationID: generation, TenantID: tenant, AsOf: current.AsOf,
				AfterRealmID: cursor.Realm, AfterPlayerGuid: cursor.Player,
				AfterInstanceName: cursor.Instance, AfterEncounterName: cursor.Boss,
				AfterDifficultyName: cursor.Difficulty, AfterMaxPlayers: cursor.Size,
				AfterPlayerClass: cursor.Class, AfterPlayerSpec: cursor.Spec,
				AfterPlayerSubSpec: cursor.SubSpec, AfterPerformanceMetric: cursor.Metric,
				BatchSize: tenantMasteryPageSize, AllTimeStart: database.Timestamptz(allTimeStart),
				PeriodStart: database.Timestamptz(periodStart),
			})
			if err != nil {
				return err
			}
			if len(rows) == 0 {
				return advanceMasteryCursor(ctx, tx, current, "mastery_pending", projectionCursor{Rating: "guild"})
			}
			if err := writeTenantPlayerMasteryPage(ctx, tx, generation, tenant, policy, rows); err != nil {
				return err
			}
			last := rows[len(rows)-1]
			next := projectionCursor{Rating: "player", Realm: last.RealmID, Player: last.PlayerGuid,
				Instance: last.InstanceName, Boss: last.EncounterName, Difficulty: last.DifficultyName,
				Size: last.MaxPlayers, Class: last.PlayerClass, Spec: last.PlayerSpec,
				SubSpec: last.PlayerSubSpec, Metric: last.PerformanceMetric}
			return advanceMasteryCursor(ctx, tx, current, "mastery_pending", next)
		}

		rows, err := tx.CalculateTenantGuildMasteryPage(ctx, database.CalculateTenantGuildMasteryPageParams{
			GenerationID: generation, TenantID: tenant, AsOf: current.AsOf,
			AfterRealmID: cursor.Realm, AfterGuildID: cursor.Guild,
			AfterInstanceName: cursor.Instance, AfterEncounterName: cursor.Boss,
			AfterDifficultyName: cursor.Difficulty, AfterMaxPlayers: cursor.Size,
			BatchSize: tenantMasteryPageSize, AllTimeStart: database.Timestamptz(allTimeStart),
			PeriodStart: database.Timestamptz(periodStart),
		})
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			return advanceMasteryCursor(ctx, tx, current, "player_scopes", projectionCursor{})
		}
		if err := writeTenantGuildMasteryPage(ctx, tx, generation, tenant, policy, rows); err != nil {
			return err
		}
		last := rows[len(rows)-1]
		if !last.GuildID.Valid {
			return errors.New("set-based guild Mastery returned a null guild")
		}
		next := projectionCursor{Rating: "guild", Realm: last.RealmID, Guild: last.GuildID.UUID,
			Instance: last.InstanceName, Boss: last.EncounterName, Difficulty: last.DifficultyName,
			Size: last.MaxPlayers}
		return advanceMasteryCursor(ctx, tx, current, "mastery_pending", next)
	}, nil)
}

func tenantMasteryPolicy(cp database.RatingRebuildCheckpoint, tenant uuid.UUID) (database.RatingGroupPolicy, error) {
	var manifest struct {
		Writer       string              `json:"writer"`
		RulesVersion int32               `json:"rules_version"`
		Policy       *TenantRatingPolicy `json:"tenant_policy"`
	}
	if err := json.Unmarshal(cp.Manifest, &manifest); err != nil {
		return database.RatingGroupPolicy{}, fmt.Errorf("invalid tenant mastery manifest: %w", err)
	}
	if manifest.Writer != "tenant" || manifest.RulesVersion != 2 || manifest.Policy == nil ||
		manifest.Policy.TenantID != tenant || manifest.Policy.Version != 2 || manifest.Policy.PeriodDays != 180 {
		return database.RatingGroupPolicy{}, errors.New("tenant mastery requires a frozen fixed-rules checkpoint")
	}
	return manifest.Policy.masteryPolicy(), nil
}

func masteryResultFromSummary(policy database.RatingGroupPolicy, instance, boss string,
	eligible, excluded int64, best, floor, form pgtype.Float8) (MasteryResult, error) {
	if eligible == 0 {
		if excluded != 0 || best.Valid || floor.Valid || form.Valid {
			return MasteryResult{}, errors.New("empty Mastery window returned aggregates")
		}
		return MasteryResult{}, nil
	}
	if eligible > math.MaxInt32 || excluded < 0 || excluded > eligible ||
		!best.Valid || !floor.Valid || !form.Valid {
		return MasteryResult{}, errors.New("invalid set-based Mastery summary")
	}
	return completedMastery(database.RatingMasteryAccumulator{
		EligibleKills: eligible, ExcludedKills: excluded, Best: best.Float64,
		FloorScore: floor, FormScore: form,
	}, policy, instance, boss)
}

func writeTenantPlayerMasteryPage(ctx context.Context, tx database.Store, generation, tenant uuid.UUID,
	policy database.RatingGroupPolicy, rows []database.CalculateTenantPlayerMasteryPageRow) error {
	accumulators := make([]database.UpsertCompletedRatingMasteryAccumulatorParams, 0, len(rows))
	scores := make([]database.InsertPlayerTenantBossScoresParams, 0, 2*len(rows))
	for _, row := range rows {
		result, err := masteryResultFromSummary(policy, row.InstanceName, row.EncounterName,
			row.EligibleKills, row.ExcludedKills, row.Best, row.FloorScore, row.FormScore)
		if err != nil {
			return err
		}
		accumulators = append(accumulators, database.UpsertCompletedRatingMasteryAccumulatorParams{
			GenerationID: generation, TenantID: tenant, SubjectKind: "player", RealmID: row.RealmID,
			SubjectID: row.PlayerGuid, InstanceName: row.InstanceName, EncounterName: row.EncounterName,
			DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, PlayerClass: row.PlayerClass,
			PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec, PerformanceMetric: row.PerformanceMetric,
			WindowKind: row.WindowKind, EligibleKills: row.EligibleKills, ExcludedKills: row.ExcludedKills,
			Best: result.Best, FloorScore: row.FloorScore, FormScore: row.FormScore,
		})
		if result.EligibleKills == 0 {
			continue
		}
		for _, metric := range []struct {
			name  string
			value float64
		}{{"mastery", result.Mastery}, {"ranked_mastery", result.Ranked}} {
			scores = append(scores, database.InsertPlayerTenantBossScoresParams{
				GenerationID: generation, TenantID: tenant, RealmID: row.RealmID, PlayerGuid: row.PlayerGuid,
				InstanceName: row.InstanceName, EncounterName: row.EncounterName, DifficultyName: row.DifficultyName,
				MaxPlayers: row.MaxPlayers, PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec,
				PlayerSubSpec: row.PlayerSubSpec, PerformanceMetric: row.PerformanceMetric,
				RatingMetric: metric.name, WindowKind: row.WindowKind, WindowStart: row.WindowStart,
				WindowEnd: row.WindowEnd, Score: metric.value,
				BestLockedParse: row.Best, Form: row.FormScore, FloorScore: row.FloorScore,
				EligibleKills: int32(row.EligibleKills),
			})
		}
	}
	if err := execPlayerMasteryScores(ctx, tx, scores); err != nil {
		return err
	}
	return execCompletedMasteryAccumulators(ctx, tx, accumulators)
}

func writeTenantGuildMasteryPage(ctx context.Context, tx database.Store, generation, tenant uuid.UUID,
	policy database.RatingGroupPolicy, rows []database.CalculateTenantGuildMasteryPageRow) error {
	accumulators := make([]database.UpsertCompletedRatingMasteryAccumulatorParams, 0, len(rows))
	scores := make([]database.InsertGuildTenantBossScoresParams, 0, 2*len(rows))
	for _, row := range rows {
		if !row.GuildID.Valid {
			return errors.New("set-based guild Mastery returned a null guild")
		}
		result, err := masteryResultFromSummary(policy, row.InstanceName, row.EncounterName,
			row.EligibleKills, row.ExcludedKills, row.Best, row.FloorScore, row.FormScore)
		if err != nil {
			return err
		}
		accumulators = append(accumulators, database.UpsertCompletedRatingMasteryAccumulatorParams{
			GenerationID: generation, TenantID: tenant, SubjectKind: "guild", RealmID: row.RealmID,
			SubjectID: row.GuildID.UUID.String(), InstanceName: row.InstanceName, EncounterName: row.EncounterName,
			DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, PerformanceMetric: "none",
			WindowKind: row.WindowKind, EligibleKills: row.EligibleKills, ExcludedKills: row.ExcludedKills,
			Best: result.Best, FloorScore: row.FloorScore, FormScore: row.FormScore,
		})
		if result.EligibleKills == 0 {
			continue
		}
		for _, metric := range []struct {
			name  string
			value float64
		}{{"mastery", result.Mastery}, {"ranked_mastery", result.Ranked}} {
			scores = append(scores, database.InsertGuildTenantBossScoresParams{
				GenerationID: generation, TenantID: tenant, RealmID: row.RealmID, GuildID: row.GuildID.UUID,
				InstanceName: row.InstanceName, EncounterName: row.EncounterName, DifficultyName: row.DifficultyName,
				MaxPlayers: row.MaxPlayers, RatingMetric: metric.name, WindowKind: row.WindowKind,
				WindowStart: row.WindowStart, WindowEnd: row.WindowEnd, Score: metric.value,
				BestLockedParse: row.Best, Form: row.FormScore, FloorScore: row.FloorScore,
				EligibleKills: int32(row.EligibleKills),
			})
		}
	}
	if err := execGuildMasteryScores(ctx, tx, scores); err != nil {
		return err
	}
	return execCompletedMasteryAccumulators(ctx, tx, accumulators)
}

func execPlayerMasteryScores(ctx context.Context, tx database.Store, rows []database.InsertPlayerTenantBossScoresParams) error {
	var batchErr error
	tx.InsertPlayerTenantBossScores(ctx, rows).QueryRow(func(_ int, inserted int32, err error) {
		if batchErr != nil {
			return
		}
		if err != nil {
			batchErr = err
		} else if inserted != 1 {
			batchErr = errors.New("tenant Mastery player score was not inserted")
		}
	})
	return batchErr
}

func execGuildMasteryScores(ctx context.Context, tx database.Store, rows []database.InsertGuildTenantBossScoresParams) error {
	var batchErr error
	tx.InsertGuildTenantBossScores(ctx, rows).QueryRow(func(_ int, inserted int32, err error) {
		if batchErr != nil {
			return
		}
		if err != nil {
			batchErr = err
		} else if inserted != 1 {
			batchErr = errors.New("tenant Mastery guild score was not inserted")
		}
	})
	return batchErr
}

func execCompletedMasteryAccumulators(ctx context.Context, tx database.Store, rows []database.UpsertCompletedRatingMasteryAccumulatorParams) error {
	var batchErr error
	tx.UpsertCompletedRatingMasteryAccumulator(ctx, rows).QueryRow(func(_ int, inserted int32, err error) {
		if batchErr != nil {
			return
		}
		if err != nil {
			batchErr = err
		} else if inserted != 1 {
			batchErr = errors.New("tenant Mastery accumulator was not completed")
		}
	})
	return batchErr
}

func finishLegacyTenantMasteryPeriod(ctx context.Context, store database.Store, cp database.RatingRebuildCheckpoint,
	policy database.RatingGroupPolicy, cursor projectionCursor, kind string) error {
	subject := MasterySubject{
		GenerationID: cp.GenerationID, TenantID: cp.TenantID, SubjectKind: kind,
		RealmID: cursor.Realm, InstanceName: cursor.Instance, EncounterName: cursor.Boss,
		DifficultyName: cursor.Difficulty, MaxPlayers: cursor.Size, WindowKind: "period",
	}
	if kind == "player" {
		subject.SubjectID, subject.PlayerClass, subject.PlayerSpec = cursor.Player, cursor.Class, cursor.Spec
		subject.PlayerSubSpec, subject.PerformanceMetric = cursor.SubSpec, cursor.Metric
	} else {
		subject.SubjectID, subject.PerformanceMetric = cursor.Guild.String(), "none"
	}
	next := cursor
	next.Window = ""
	encoded, err := json.Marshal(next)
	if err != nil {
		return err
	}
	periodStart := cp.AsOf.Time.AddDate(0, 0, -int(policy.PeriodDays))
	_, _, err = AdvanceMasterySubject(ctx, store, subject, cp.AsOf.Time, periodStart, policy, cp.Cursor, encoded,
		func(ctx context.Context, tx database.Store, result MasteryResult) error {
			if result.EligibleKills == 0 {
				return nil
			}
			for _, metric := range []struct {
				name  string
				value float64
			}{{"mastery", result.Mastery}, {"ranked_mastery", result.Ranked}} {
				if err := writeTenantMasteryBoss(ctx, tx, subject, metric.name, metric.value, result, cp.AsOf.Time, periodStart); err != nil {
					return err
				}
			}
			return nil
		})
	return err
}

// writeTenantMasteryBoss runs inside the accumulator's checkpoint transaction.
func writeTenantMasteryBoss(ctx context.Context, tx database.Store, s MasterySubject, metric string, value float64, r MasteryResult, asOf, periodStart time.Time) error {
	if r.EligibleKills == 0 {
		return nil
	}
	best := pgtype.Float8{Float64: r.Best, Valid: true}
	form := pgtype.Float8{Float64: r.Form, Valid: true}
	floor := pgtype.Float8{Float64: r.Floor, Valid: true}
	var start, end pgtype.Timestamptz
	if s.WindowKind == "period" {
		start, end = database.Timestamptz(periodStart), database.Timestamptz(asOf)
	}
	if s.SubjectKind == "player" {
		n, err := tx.InsertPlayerTenantBossScore(ctx, database.InsertPlayerTenantBossScoreParams{
			GenerationID: s.GenerationID, TenantID: s.TenantID, RealmID: s.RealmID, PlayerGuid: s.SubjectID,
			InstanceName: s.InstanceName, EncounterName: s.EncounterName, DifficultyName: s.DifficultyName,
			MaxPlayers: s.MaxPlayers, PlayerClass: s.PlayerClass, PlayerSpec: s.PlayerSpec,
			PlayerSubSpec: s.PlayerSubSpec, PerformanceMetric: s.PerformanceMetric,
			RatingMetric: metric, WindowKind: s.WindowKind, WindowStart: start, WindowEnd: end,
			Score: value, BestLockedParse: best, Form: form, FloorScore: floor, EligibleKills: int32(r.EligibleKills),
		})
		if err != nil {
			return err
		}
		if n != 1 {
			return fmt.Errorf("tenant mastery player score was not inserted")
		}
		return nil
	}
	guild, err := uuid.Parse(s.SubjectID)
	if err != nil {
		return err
	}
	n, err := tx.InsertGuildTenantBossScore(ctx, database.InsertGuildTenantBossScoreParams{
		GenerationID: s.GenerationID, TenantID: s.TenantID, RealmID: s.RealmID, GuildID: guild,
		InstanceName: s.InstanceName, EncounterName: s.EncounterName, DifficultyName: s.DifficultyName,
		MaxPlayers: s.MaxPlayers, RatingMetric: metric, WindowKind: s.WindowKind,
		WindowStart: start, WindowEnd: end, Score: value, BestLockedParse: best,
		Form: form, FloorScore: floor, EligibleKills: int32(r.EligibleKills),
	})
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("tenant mastery guild score was not inserted")
	}
	return nil
}
