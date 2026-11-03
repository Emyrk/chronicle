package ratingmath

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// MasteryStageStep advances one subject by at most one 200-observation pass.
// The checkpoint identifies the subject, and only advances after both scores
// are committed. The manifest, not live membership, determines eligibility.
func MasteryStageStep(ctx context.Context, store database.Store, tenant, generation uuid.UUID) error {
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
	var m projectionManifest
	if err := json.Unmarshal(cp.Manifest, &m); err != nil {
		return fmt.Errorf("invalid mastery manifest: %w", err)
	}
	var c projectionCursor
	if err := json.Unmarshal(cp.Cursor, &c); err != nil {
		return fmt.Errorf("invalid mastery cursor: %w", err)
	}
	kind := c.Rating
	if kind == "" {
		kind = "player"
	}
	if kind != "player" && kind != "guild" {
		return fmt.Errorf("invalid mastery kind %q", kind)
	}
	var subject MasterySubject
	subject.GenerationID, subject.TenantID, subject.SubjectKind = generation, tenant, kind
	// A period cursor is the second window of the same subject. Otherwise
	// enumerate the next distinct key after the completed subject.
	if c.Window == "period" {
		subject.RealmID, subject.InstanceName, subject.EncounterName = c.Realm, c.Instance, c.Boss
		subject.DifficultyName, subject.MaxPlayers = c.Difficulty, c.Size
		if kind == "player" {
			subject.SubjectID, subject.PlayerClass, subject.PlayerSpec, subject.PlayerSubSpec = c.Player, c.Class, c.Spec, c.SubSpec
			subject.PerformanceMetric = c.Metric
		} else {
			subject.SubjectID, subject.PerformanceMetric = c.Guild.String(), "none"
		}
	} else if kind == "player" {
		keys, err := store.ListRatingMasteryPlayerKeys(ctx, database.ListRatingMasteryPlayerKeysParams{
			GenerationID: generation, TenantID: tenant, AsOf: cp.AsOf, AfterRealmID: c.Realm,
			AfterPlayerGuid: c.Player, AfterInstanceName: c.Instance, AfterEncounterName: c.Boss,
			AfterDifficultyName: c.Difficulty, AfterMaxPlayers: c.Size, AfterPlayerClass: c.Class,
			AfterPlayerSpec: c.Spec, AfterPlayerSubSpec: c.SubSpec, AfterPerformanceMetric: c.Metric, BatchSize: 1,
		})
		if err != nil {
			return err
		}
		if len(keys) == 0 {
			return advanceMasteryCursor(ctx, store, cp, "mastery_pending", projectionCursor{Rating: "guild"})
		}
		k := keys[0]
		subject.RealmID, subject.SubjectID, subject.InstanceName, subject.EncounterName = k.RealmID, k.PlayerGuid, k.InstanceName, k.EncounterName
		subject.DifficultyName, subject.MaxPlayers, subject.PlayerClass, subject.PlayerSpec = k.DifficultyName, k.MaxPlayers, k.PlayerClass, k.PlayerSpec
		subject.PlayerSubSpec, subject.PerformanceMetric = k.PlayerSubSpec, k.PerformanceMetric
	} else {
		keys, err := store.ListRatingMasteryGuildKeys(ctx, database.ListRatingMasteryGuildKeysParams{
			GenerationID: generation, TenantID: tenant, AsOf: cp.AsOf, AfterRealmID: c.Realm,
			AfterGuildID: c.Guild, AfterInstanceName: c.Instance, AfterEncounterName: c.Boss,
			AfterDifficultyName: c.Difficulty, AfterMaxPlayers: c.Size, BatchSize: 1,
		})
		if err != nil {
			return err
		}
		if len(keys) == 0 {
			return advanceMasteryCursor(ctx, store, cp, "player_scopes", projectionCursor{})
		}
		k := keys[0]
		subject.RealmID, subject.SubjectID, subject.InstanceName, subject.EncounterName = k.RealmID, k.GuildID.UUID.String(), k.InstanceName, k.EncounterName
		subject.DifficultyName, subject.MaxPlayers, subject.PerformanceMetric = k.DifficultyName, k.MaxPlayers, "none"
	}
	next := projectionCursor{Rating: kind, Realm: subject.RealmID, Instance: subject.InstanceName, Boss: subject.EncounterName,
		Difficulty: subject.DifficultyName, Size: subject.MaxPlayers, Metric: subject.PerformanceMetric,
		Class: subject.PlayerClass, Spec: subject.PlayerSpec, SubSpec: subject.PlayerSubSpec}
	if kind == "player" {
		next.Player = subject.SubjectID
	} else {
		next.Guild, _ = uuid.Parse(subject.SubjectID)
	}
	if c.Window != "period" {
		next.Window = "period"
		subject.WindowKind = "all_time"
	} else {
		subject.WindowKind = "period"
	}
	encoded, err := json.Marshal(next)
	if err != nil {
		return err
	}
	policy, _, eligible := m.forRealm(subject.RealmID, subject.InstanceName, subject.EncounterName)
	if !eligible {
		// Skipping an ineligible subject still consumes only one key/window.
		return advanceMasteryCursor(ctx, store, cp, "mastery_pending", next)
	}
	start := time.Date(2, 1, 1, 0, 0, 0, 0, time.UTC) // nonzero, before all supported rating observations
	periodStart := cp.AsOf.Time.AddDate(0, 0, -int(policy.PeriodDays))
	if subject.WindowKind == "period" {
		start = periodStart
	}
	_, _, err = AdvanceMasterySubject(ctx, store, subject, cp.AsOf.Time, start, policy, cp.Cursor, encoded,
		func(ctx context.Context, tx database.Store, result MasteryResult) error {
			if result.EligibleKills == 0 {
				return nil
			}
			for _, metric := range []struct {
				name  string
				value float64
			}{{"mastery", result.Mastery}, {"ranked_mastery", result.Ranked}} {
				if kind == "player" {
					row := ratingScoreParams(generation, tenant, policy.GroupID, scoredKey{realm: subject.RealmID, player: subject.SubjectID,
						instance: subject.InstanceName, boss: subject.EncounterName, difficulty: subject.DifficultyName,
						size: subject.MaxPlayers, class: subject.PlayerClass, spec: subject.PlayerSpec, subSpec: subject.PlayerSubSpec,
						metric: subject.PerformanceMetric}, metric.name, subject.WindowKind, metric.value, cp.AsOf.Time, periodStart)
					row.EligibleKills = int32(result.EligibleKills)
					row.BestLockedParse = pgtype.Float8{Float64: result.Best, Valid: true}
					row.Form = pgtype.Float8{Float64: result.Form, Valid: true}
					row.FloorScore = pgtype.Float8{Float64: result.Floor, Valid: true}
					if err := tx.InsertRatingBossScore(ctx, row); err != nil {
						return err
					}
				} else {
					id, _ := uuid.Parse(subject.SubjectID)
					row := guildScoreParams(generation, tenant, policy.GroupID, guildKey{realm: subject.RealmID, guild: id,
						instance: subject.InstanceName, boss: subject.EncounterName, difficulty: subject.DifficultyName,
						size: subject.MaxPlayers}, metric.name, subject.WindowKind, metric.value, cp.AsOf.Time, periodStart)
					row.EligibleKills = int32(result.EligibleKills)
					row.BestLockedParse = pgtype.Float8{Float64: result.Best, Valid: true}
					row.Form = pgtype.Float8{Float64: result.Form, Valid: true}
					row.FloorScore = pgtype.Float8{Float64: result.Floor, Valid: true}
					if err := tx.InsertGuildRatingBossScore(ctx, row); err != nil {
						return err
					}
				}
			}
			return nil
		})
	return err
}

var ErrRatingConfigStale = errors.New("rating configuration changed during rebuild")

func advanceMasteryCursor(ctx context.Context, db database.Store, cp database.RatingRebuildCheckpoint, phase string, cursor projectionCursor) error {
	encoded, err := json.Marshal(cursor)
	if err != nil {
		return err
	}
	return db.InTx(ctx, func(tx database.Store) error {
		current, err := tx.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: cp.TenantID, GenerationID: cp.GenerationID})
		if err != nil {
			return err
		}
		rev, err := tx.GetRatingConfigRevision(ctx, cp.TenantID)
		if err != nil {
			return err
		}
		if rev != current.ConfigRevision {
			return ErrRatingConfigStale
		}
		if current.Phase != cp.Phase || string(current.Cursor) != string(cp.Cursor) {
			return ErrMasteryCheckpointChanged
		}
		n, err := tx.AdvanceRatingRebuildCheckpoint(ctx, database.AdvanceRatingRebuildCheckpointParams{
			TenantID: cp.TenantID, GenerationID: cp.GenerationID, ExpectedPhase: cp.Phase,
			ExpectedCursor: cp.Cursor, NextPhase: phase, NextCursor: encoded,
		})
		if err != nil {
			return err
		}
		if n != 1 {
			return ErrMasteryCheckpointChanged
		}
		return nil
	}, nil)
}
