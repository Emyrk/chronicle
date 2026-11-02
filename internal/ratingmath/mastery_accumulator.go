package ratingmath

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// MasterySubject identifies one frozen cohort and window. Guild subjects use
// the guild UUID string as SubjectID, metric "none", and empty class/spec.
// The caller must only enumerate subjects from immutable staged observations.
type MasterySubject = database.InitRatingMasteryAccumulatorParams

var ErrMasteryCheckpointChanged = errors.New("mastery rebuild checkpoint changed")

// AdvanceMasterySubject processes at most 200 observations in one short
// transaction. expectedCursor is the exact JSON checkpoint cursor supplied by
// the caller. On the final pass, nextCursor replaces it atomically; otherwise
// it stays unchanged. A successful incomplete step must be called again with
// the same arguments. write MUST persist the completed mastery/ranked scores
// through the supplied transaction; its failure rolls back the pass and cursor.
// On completion the returned result is valid and the
// caller may move to the next frozen subject/window. The caller owns the
// mastery_pending -> player_scopes transition after ALL subjects complete.
// Neither policy, asOf, nor windowStart is persisted: callers MUST reload
// identical values from the frozen generation manifest on every retry.
// Stage observations MUST remain immutable through all four passes.
func AdvanceMasterySubject(ctx context.Context, db database.Store, subject MasterySubject,
	asOf, windowStart time.Time, policy database.RatingGroupPolicy,
	expectedCursor, nextCursor []byte, write func(context.Context, database.Store, MasteryResult) error) (result MasteryResult, complete bool, err error) {
	if db == nil || write == nil || subject.GenerationID == uuid.Nil || subject.SubjectID == "" ||
		(subject.SubjectKind != "player" && subject.SubjectKind != "guild") ||
		(subject.WindowKind != "period" && subject.WindowKind != "all_time") ||
		asOf.IsZero() || windowStart.IsZero() || windowStart.After(asOf) ||
		policy.HalfLifeDays <= 0 || math.IsNaN(policy.HalfLifeDays) || math.IsInf(policy.HalfLifeDays, 0) ||
		policy.FullRankKills < 1 || policy.RankOneWeight < 0 || policy.RankOneWeight > 1 ||
		math.IsNaN(policy.RankOneWeight) || math.IsInf(policy.RankOneWeight, 0) ||
		math.IsNaN(policy.BestWeight) || math.IsNaN(policy.FormWeight) || math.IsNaN(policy.FloorWeight) ||
		policy.BestWeight < 0 || policy.FormWeight < 0 || policy.FloorWeight < 0 ||
		math.IsInf(policy.BestWeight, 0) || math.IsInf(policy.FormWeight, 0) || math.IsInf(policy.FloorWeight, 0) ||
		math.Abs(policy.BestWeight+policy.FormWeight+policy.FloorWeight-1) > 1e-9 ||
		(subject.WindowKind == "period" && (policy.PeriodDays <= 0 || !windowStart.Equal(asOf.AddDate(0, 0, -int(policy.PeriodDays))))) {
		return result, false, errors.New("invalid mastery subject, window or policy")
	}
	if subject.SubjectKind == "guild" {
		if _, parseErr := uuid.Parse(subject.SubjectID); parseErr != nil || subject.PerformanceMetric != "none" ||
			subject.PlayerClass != "" || subject.PlayerSpec != "" || subject.PlayerSubSpec != "" {
			return result, false, errors.New("invalid guild mastery subject")
		}
	} else if subject.PerformanceMetric != "dps" && subject.PerformanceMetric != "hps" {
		return result, false, errors.New("invalid player mastery metric")
	}
	err = db.InTx(ctx, func(tx database.Store) error {
		checkpoint, err := tx.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{
			GenerationID: subject.GenerationID, TenantID: subject.TenantID,
		})
		if err != nil {
			return err
		}
		if checkpoint.Phase != "mastery_pending" || !bytes.Equal(checkpoint.Cursor, expectedCursor) ||
			!checkpoint.AsOf.Valid || !checkpoint.AsOf.Time.Equal(asOf) {
			return ErrMasteryCheckpointChanged
		}
		if err := tx.InitRatingMasteryAccumulator(ctx, subject); err != nil {
			return err
		}
		state, err := tx.GetRatingMasteryAccumulator(ctx, database.GetRatingMasteryAccumulatorParams(subject))
		if err != nil {
			return err
		}
		if state.Pass == "complete" {
			return errors.New("completed mastery subject still owns checkpoint cursor")
		}
		rows, err := masteryPage(ctx, tx, subject, state, asOf, windowStart)
		if err != nil {
			return err
		}
		next := database.AdvanceRatingMasteryAccumulatorParams{
			GenerationID: subject.GenerationID, TenantID: subject.TenantID, SubjectKind: subject.SubjectKind,
			RealmID: subject.RealmID, SubjectID: subject.SubjectID, InstanceName: subject.InstanceName,
			EncounterName: subject.EncounterName, DifficultyName: subject.DifficultyName, MaxPlayers: subject.MaxPlayers,
			PlayerClass: subject.PlayerClass, PlayerSpec: subject.PlayerSpec, PlayerSubSpec: subject.PlayerSubSpec,
			PerformanceMetric: subject.PerformanceMetric, WindowKind: subject.WindowKind,
			ExpectedPass: state.Pass, ExpectedVersion: state.Version, NextPass: state.Pass,
			NextPosition: state.Position, NextEligibleKills: state.EligibleKills,
			NextExcludedKills: state.ExcludedKills, NextBest: state.Best,
			NextLatestRetainedAt: state.LatestRetainedAt, NextTotalWeight: state.TotalWeight,
			NextCumulativeWeight: state.CumulativeWeight, NextFloorScore: state.FloorScore,
			NextFormScore: state.FormScore, NextLastRetainedScore: state.LastRetainedScore,
		}
		for _, row := range rows {
			if !row.score.Valid || !row.killed.Valid {
				return errors.New("invalid staged mastery observation")
			}
			next.NextPosition++
			if state.Pass == "count" {
				next.NextEligibleKills++
				next.NextBest = math.Max(next.NextBest, row.score.Float64)
				continue
			}
			if next.NextPosition > state.EligibleKills {
				return errors.New("mastery stage grew during replay")
			}
			if next.NextPosition <= state.ExcludedKills {
				continue
			}
			switch state.Pass {
			case "latest":
				if !next.NextLatestRetainedAt.Valid || row.killed.Time.After(next.NextLatestRetainedAt.Time) {
					next.NextLatestRetainedAt = row.killed
				}
			case "weight", "quantile":
				if !state.LatestRetainedAt.Valid {
					return errors.New("missing retained recency anchor")
				}
				weight := math.Exp2(-state.LatestRetainedAt.Time.Sub(row.killed.Time).Hours() / (policy.HalfLifeDays * 24))
				if state.Pass == "weight" {
					next.NextTotalWeight += weight
				} else {
					next.NextCumulativeWeight += weight
					next.NextLastRetainedScore = pgtype.Float8{Float64: row.score.Float64, Valid: true}
					if !next.NextFloorScore.Valid && next.NextCumulativeWeight >= .25*state.TotalWeight {
						next.NextFloorScore = next.NextLastRetainedScore
					}
					if !next.NextFormScore.Valid && next.NextCumulativeWeight >= .5*state.TotalWeight {
						next.NextFormScore = next.NextLastRetainedScore
					}
				}
			default:
				return fmt.Errorf("unknown mastery pass %q", state.Pass)
			}
		}
		if len(rows) > 0 {
			last := rows[len(rows)-1]
			next.NextCursorScore = last.score
			next.NextCursorKilledAt = last.killed
			next.NextCursorRunID = uuid.NullUUID{UUID: last.run, Valid: true}
		}
		if len(rows) < 200 {
			if state.Pass != "count" && next.NextPosition != state.EligibleKills {
				return errors.New("mastery stage changed length during replay")
			}
			switch state.Pass {
			case "count":
				next.NextExcludedKills = int64(DropCount(int(next.NextEligibleKills)))
				next.NextPass = "latest"
			case "latest":
				next.NextPass = "weight"
			case "weight":
				if next.NextEligibleKills > 0 && next.NextTotalWeight == 0 {
					return errors.New("recency weights underflowed")
				}
				next.NextPass = "quantile"
			case "quantile":
				next.NextPass = "complete"
				if !next.NextFloorScore.Valid {
					next.NextFloorScore = next.NextLastRetainedScore
				}
				if !next.NextFormScore.Valid {
					next.NextFormScore = next.NextLastRetainedScore
				}
			default:
				return fmt.Errorf("unknown mastery pass %q", state.Pass)
			}
			next.NextPosition = 0
			next.NextCursorScore = pgtype.Float8{}
			next.NextCursorKilledAt = pgtype.Timestamptz{}
			next.NextCursorRunID = uuid.NullUUID{}
		}
		if math.IsInf(next.NextTotalWeight, 0) || math.IsNaN(next.NextTotalWeight) ||
			math.IsInf(next.NextCumulativeWeight, 0) || math.IsNaN(next.NextCumulativeWeight) {
			return errors.New("mastery weights overflowed")
		}
		if next.NextPass == "complete" {
			state.EligibleKills, state.ExcludedKills, state.Best = next.NextEligibleKills, next.NextExcludedKills, next.NextBest
			state.TotalWeight, state.FloorScore, state.FormScore = next.NextTotalWeight, next.NextFloorScore, next.NextFormScore
			result, err = completedMastery(state, policy)
			if err != nil {
				return err
			}
			if err := write(ctx, tx, result); err != nil {
				return err
			}
		}
		n, err := tx.AdvanceRatingMasteryAccumulator(ctx, next)
		if err != nil {
			return err
		}
		if n != 1 {
			return ErrMasteryCheckpointChanged
		}
		cursor := expectedCursor
		if next.NextPass == "complete" {
			cursor = nextCursor
		}
		n, err = tx.AdvanceRatingRebuildCheckpoint(ctx, database.AdvanceRatingRebuildCheckpointParams{
			GenerationID: subject.GenerationID, TenantID: subject.TenantID,
			ExpectedPhase: "mastery_pending", ExpectedCursor: expectedCursor,
			NextPhase: "mastery_pending", NextCursor: cursor,
		})
		if err != nil {
			return err
		}
		if n != 1 {
			return ErrMasteryCheckpointChanged
		}
		if next.NextPass == "complete" {
			complete = true
		}
		return nil
	}, nil)
	if err != nil {
		return MasteryResult{}, false, err
	}
	return result, complete, nil
}

type masteryRow struct {
	score  pgtype.Float8
	killed pgtype.Timestamptz
	run    uuid.UUID
}

func masteryPage(ctx context.Context, tx database.Store, key MasterySubject, state database.RatingMasteryAccumulator, asOf, start time.Time) ([]masteryRow, error) {
	rows := make([]masteryRow, 0, 200)
	first := !state.CursorScore.Valid
	if !first && (!state.CursorKilledAt.Valid || !state.CursorRunID.Valid) {
		return nil, errors.New("incomplete mastery cursor")
	}
	if key.SubjectKind == "player" {
		batch, err := tx.ListRatingMasteryPlayerPage(ctx, database.ListRatingMasteryPlayerPageParams{
			GenerationID: key.GenerationID, TenantID: key.TenantID, RealmID: key.RealmID, PlayerGuid: key.SubjectID,
			InstanceName: key.InstanceName, EncounterName: key.EncounterName, DifficultyName: key.DifficultyName,
			MaxPlayers: key.MaxPlayers, PlayerClass: key.PlayerClass, PlayerSpec: key.PlayerSpec,
			PlayerSubSpec: key.PlayerSubSpec, PerformanceMetric: key.PerformanceMetric,
			WindowStart: database.Timestamptz(start), AsOf: database.Timestamptz(asOf), FirstPage: first,
			AfterScore: state.CursorScore.Float64, AfterKilledAt: state.CursorKilledAt,
			AfterRunID: state.CursorRunID.UUID, BatchSize: 200,
		})
		if err != nil {
			return nil, err
		}
		for _, row := range batch {
			rows = append(rows, masteryRow{row.LockedParse, row.KilledAt, row.RunID})
		}
	} else {
		id, _ := uuid.Parse(key.SubjectID)
		batch, err := tx.ListRatingMasteryGuildPage(ctx, database.ListRatingMasteryGuildPageParams{
			GenerationID: key.GenerationID, TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: uuid.NullUUID{UUID: id, Valid: true}, InstanceName: key.InstanceName,
			EncounterName: key.EncounterName, DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers,
			WindowStart: database.Timestamptz(start), AsOf: database.Timestamptz(asOf), FirstPage: first,
			AfterScore: state.CursorScore.Float64, AfterKilledAt: state.CursorKilledAt,
			AfterRunID: state.CursorRunID.UUID, BatchSize: 200,
		})
		if err != nil {
			return nil, err
		}
		for _, row := range batch {
			rows = append(rows, masteryRow{row.LockedParse, row.KilledAt, row.RunID})
		}
	}
	return rows, nil
}

func completedMastery(s database.RatingMasteryAccumulator, policy database.RatingGroupPolicy) (MasteryResult, error) {
	r := MasteryResult{EligibleKills: int(s.EligibleKills), ExcludedKills: int(s.ExcludedKills), Best: s.Best}
	if s.EligibleKills == 0 {
		return r, nil
	}
	if !s.FloorScore.Valid || !s.FormScore.Valid {
		return MasteryResult{}, errors.New("missing mastery quantiles")
	}
	r.Floor, r.Form = s.FloorScore.Float64, s.FormScore.Float64
	r.Mastery = policy.BestWeight*r.Best + policy.FormWeight*r.Form + policy.FloorWeight*r.Floor
	r.Confidence = 1 - math.Exp(-float64(s.EligibleKills)/4)
	weight := 1.0
	if s.EligibleKills < int64(policy.FullRankKills) && policy.FullRankKills > 1 {
		weight = policy.RankOneWeight + (1-policy.RankOneWeight)*float64(s.EligibleKills-1)/float64(policy.FullRankKills-1)
	}
	r.Ranked = r.Mastery * weight
	return r, nil
}
