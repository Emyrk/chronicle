package ratingmath

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// TenantMasteryStageStep projects one bounded staged subject/window into the
// non-serving tenant boss tables. The frozen checkpoint owns progress; this
// function neither writes group scores nor publishes the generation.
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
	var m struct {
		Writer       string              `json:"writer"`
		RulesVersion int32               `json:"rules_version"`
		Policy       *TenantRatingPolicy `json:"tenant_policy"`
	}
	if err := json.Unmarshal(cp.Manifest, &m); err != nil {
		return fmt.Errorf("invalid tenant mastery manifest: %w", err)
	}
	if m.Writer != "tenant" || m.RulesVersion != 2 || m.Policy == nil || m.Policy.TenantID != tenant ||
		m.Policy.Version != 2 || m.Policy.PeriodDays != 180 {
		return fmt.Errorf("tenant mastery requires a frozen fixed-rules checkpoint")
	}
	policy := m.Policy.masteryPolicy()
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
	// Every parsed boss in every tenant realm is eligible; the curated Renown
	// manifest and former group memberships do not restrict Mastery.
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
