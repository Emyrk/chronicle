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

type PlayerCareerResult struct {
	Cohorts         []PlayerCareer
	PoolFingerprint string
	Issues          []leaderboardconfig.CareerIssue
	Status          string
}

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

// requirePlayerCareerMode rejects tenants whose cohort mode has no player careers.
func requirePlayerCareerMode(ctx context.Context, tx database.Store, tenant uuid.UUID) error {
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
	return nil
}

// ReadPlayerCareer reads persisted exact-cohort candidates, never live source
// observations. It resolves policy once in the same snapshot as stored results.
func ReadPlayerCareer(ctx context.Context, store database.Store, tenant, realm uuid.UUID, guid string) (PlayerCareerResult, error) {
	ctx, err := careerReadContext(ctx, tenant)
	if err != nil {
		return PlayerCareerResult{}, err
	}
	out := PlayerCareerResult{Cohorts: []PlayerCareer{}}
	err = store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.RequireCareerRealm(ctx, database.RequireCareerRealmParams{TenantID: tenant, RealmID: realm}); err != nil {
			return err
		}
		if err := requirePlayerCareerMode(ctx, tx, tenant); err != nil {
			return err
		}
		pool, err := CareerConfiguration(ctx, tx, tenant)
		if err != nil {
			return err
		}
		out.PoolFingerprint = pool.Fingerprint
		out.Issues = pool.Issues
		out.Status = ReduceCareer(pool, CareerInputs{}, "").PerformanceStatus
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
			out.Cohorts = append(out.Cohorts, PlayerCareer{row.PlayerClass, row.PlayerSpec, row.PlayerSubSpec, summary})
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
			out.Cohorts = append(out.Cohorts, PlayerCareer{row.PlayerClass, row.PlayerSpec, row.PlayerSubSpec, summary})
		}
		if pool.AveragesReady() && out.Status == "preparing" {
			out.Status = "no_evidence"
			if pending {
				out.Status = "preparing"
			}
			for _, cohort := range out.Cohorts {
				if cohort.PerformanceStatus == "ready" {
					out.Status = "ready"
				}
			}
			for _, cohort := range out.Cohorts {
				if cohort.PerformanceStatus == "preparing" {
					out.Status = "preparing"
				}
			}
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
		if _, err := tx.RequireCareerGuild(ctx, database.RequireCareerGuildParams{TenantID: tenant, GuildID: guild}); err != nil {
			return err
		}
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
	// A computed subject with no DPS/HPS evidence never gets a metric (it may
	// still have Renown). That is settled, not pending work.
	if out.PerformanceStatus == "preparing" && row.ComputedAt.Valid &&
		ReduceCareer(pool, inputs, "dps").PerformanceStatus == "no_evidence" &&
		ReduceCareer(pool, inputs, "hps").PerformanceStatus == "no_evidence" {
		out.PerformanceStatus = "no_evidence"
	}
	out.StoredPolicyFingerprint = row.PoolFingerprint
	if row.ComputedAt.Valid {
		at := row.ComputedAt.Time
		out.ComputedAt = &at
	}
	out.RefreshPending = row.PoolFingerprint != pool.Fingerprint || !row.ComputedAt.Valid
	return out, nil
}
