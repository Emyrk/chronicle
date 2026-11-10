package serviceratings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrCareerUnsupportedMode = errors.New("player career unavailable for configured cohort mode")

type PlayerCareer struct {
	PlayerClass   string
	PlayerSpec    string
	PlayerSubSpec string
	CareerSummary
}

func careerReadContext(ctx context.Context, tenant uuid.UUID) (context.Context, error) {
	if tenant == uuid.Nil || servicetenant.IsBypass(ctx) {
		return nil, fmt.Errorf("career read requires tenant identity")
	}
	current := servicetenant.TenantIDFromContext(ctx)
	if current != uuid.Nil && current != tenant {
		return nil, fmt.Errorf("career tenant mismatch")
	}
	return servicetenant.WithTenantID(ctx, tenant), nil
}

// ReadPlayerCareer reads persisted exact-cohort candidates, never live source
// observations. It resolves policy once in the same snapshot as stored results.
func ReadPlayerCareer(ctx context.Context, store database.Store, tenant, realm uuid.UUID, guid string) ([]PlayerCareer, error) {
	ctx, err := careerReadContext(ctx, tenant)
	if err != nil {
		return nil, err
	}
	out := []PlayerCareer{}
	err = store.InTx(ctx, func(tx database.Store) error {
		tenantRow, err := tx.GetTenantByID(ctx, tenant)
		if err != nil {
			return err
		}
		var config struct {
			CohortMode string `json:"cohort_mode"`
		}
		if len(tenantRow.ParseConfig) > 0 {
			if err := json.Unmarshal(tenantRow.ParseConfig, &config); err != nil {
				return err
			}
		}
		switch strings.ToLower(strings.TrimSpace(config.CohortMode)) {
		case "class", "disabled":
			return ErrCareerUnsupportedMode
		}
		pool, err := CareerConfiguration(ctx, tx, tenant)
		if err != nil {
			return err
		}
		rows, err := tx.ReadLeaderboardPlayerCareers(ctx, database.ReadLeaderboardPlayerCareersParams{TenantID: tenant, RealmID: realm, PlayerGuid: guid})
		if err != nil {
			return err
		}
		pending, err := tx.HasPendingLeaderboardCareer(ctx, tenant)
		if err != nil {
			return err
		}
		for _, row := range rows {
			summary, err := careerStoredSummary(pool, row)
			if err != nil {
				return err
			}
			summary.RefreshPending = summary.RefreshPending || pending
			out = append(out, PlayerCareer{row.PlayerClass, row.PlayerSpec, row.PlayerSubSpec, summary})
		}
		missing, err := tx.ListUnmaterializedLeaderboardPlayerCareers(ctx, database.ListUnmaterializedLeaderboardPlayerCareersParams{TenantID: tenant, RealmID: realm, PlayerGuid: guid})
		if err != nil {
			return err
		}
		seen := map[[3]string]bool{}
		for _, row := range missing {
			cohort := [3]string{row.PlayerClass, row.PlayerSpec, row.PlayerSubSpec}
			if seen[cohort] {
				continue
			}
			allowed := false
			for _, variant := range pool.Variants {
				if variant.Active && (variant.IncludeAverage || variant.IncludeRenown) && variant.Instance == row.InstanceName && variant.Difficulty == row.DifficultyName && variant.MaxPlayers == row.MaxPlayers {
					allowed = true
					break
				}
			}
			if !allowed {
				continue
			}
			seen[cohort] = true
			summary := ReduceCareer(pool, CareerInputs{}, "")
			summary.RefreshPending = true
			out = append(out, PlayerCareer{row.PlayerClass, row.PlayerSpec, row.PlayerSubSpec, summary})
		}
		return nil
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	return out, err
}

func ReadGuildCareer(ctx context.Context, store database.Store, tenant, guild uuid.UUID) (CareerSummary, error) {
	ctx, err := careerReadContext(ctx, tenant)
	if err != nil {
		return CareerSummary{}, err
	}
	var out CareerSummary
	err = store.InTx(ctx, func(tx database.Store) error {
		pool, err := CareerConfiguration(ctx, tx, tenant)
		if err != nil {
			return err
		}
		row, err := tx.ReadLeaderboardGuildCareer(ctx, database.ReadLeaderboardGuildCareerParams{TenantID: tenant, GuildID: guild.String()})
		if errors.Is(err, pgx.ErrNoRows) {
			out = ReduceCareer(pool, CareerInputs{}, "")
			pending, pendingErr := tx.HasPendingLeaderboardCareer(ctx, tenant)
			out.RefreshPending = pending
			return pendingErr
		}
		if err != nil {
			return err
		}
		out, err = careerStoredSummary(pool, row)
		if err != nil {
			return err
		}
		pending, err := tx.HasPendingLeaderboardCareer(ctx, tenant)
		out.RefreshPending = out.RefreshPending || pending
		return err
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	return out, err
}

func careerStoredSummary(pool leaderboardconfig.CareerPool, row database.LeaderboardCareerSubject) (CareerSummary, error) {
	var inputs CareerInputs
	if err := json.Unmarshal(row.Inputs, &inputs); err != nil {
		return CareerSummary{}, fmt.Errorf("decode career inputs: %w", err)
	}
	out := ReduceCareer(pool, inputs, row.ChosenMetric)
	out.StoredPolicyFingerprint = row.PoolFingerprint
	if row.ComputedAt.Valid {
		at := row.ComputedAt.Time
		out.ComputedAt = &at
	}
	out.RefreshPending = row.PoolFingerprint != pool.Fingerprint || !row.ComputedAt.Valid
	return out, nil
}
