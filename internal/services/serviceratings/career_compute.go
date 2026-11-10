package serviceratings

import (
	"context"
	"fmt"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/google/uuid"
)

// CareerIdentity is an exact cohort identity, not a leaderboard search filter.
type CareerIdentity struct {
	SubjectKind                                       string
	RealmID                                           uuid.UUID
	SubjectID, PlayerClass, PlayerSpec, PlayerSubSpec string
}

// ComputeCareerInputs reads only materialized boss scores and metric-free Renown
// facts. The caller owns the repeatable-read snapshot and resolves pool within it.
// Weights, awards, and metric selection are deliberately left to the reducer.
func ComputeCareerInputs(ctx context.Context, db database.StoreQueries, tenant uuid.UUID, identity CareerIdentity, pool leaderboardconfig.CareerPool) (CareerInputs, error) {
	out := CareerInputs{Raids: []CareerRaidInput{}, Kills: []CareerBossKills{}}
	if tenant == uuid.Nil || identity.RealmID == uuid.Nil || identity.SubjectID == "" {
		return out, fmt.Errorf("career requires tenant, realm, and subject identity")
	}
	var guild uuid.UUID
	switch identity.SubjectKind {
	case "player":
		if identity.PlayerClass == "" || identity.PlayerSpec == "" || identity.PlayerSpec == "Class" {
			return out, fmt.Errorf("career requires an exact player spec; Class policy is deferred")
		}
	case "guild":
		var err error
		guild, err = uuid.Parse(identity.SubjectID)
		if err != nil || guild == uuid.Nil || identity.PlayerClass != "" || identity.PlayerSpec != "" || identity.PlayerSubSpec != "" {
			return out, fmt.Errorf("invalid career guild identity")
		}
	default:
		return out, fmt.Errorf("unknown career subject kind %q", identity.SubjectKind)
	}
	for _, variant := range pool.Variants {
		if !variant.Active {
			continue
		}
		if variant.IncludeAverage && len(variant.AverageBosses) > 0 {
			metrics := []string{"dps", "hps"}
			if identity.SubjectKind == "guild" {
				metrics = []string{"kill_time"}
			}
			raids := make(map[string]*CareerRaidInput, len(metrics))
			for _, metric := range metrics {
				raids[metric] = &CareerRaidInput{CareerKey: variant.CareerKey, Metric: metric}
			}
			add := func(metric string, peak, form, floor float64, count int64) {
				raid := raids[metric]
				raid.Peak += peak / float64(len(variant.AverageBosses))
				raid.Mastery += (.30*peak + .50*form + .20*floor) / float64(len(variant.AverageBosses))
				raid.EligibleKills += count
			}
			if identity.SubjectKind == "player" {
				rows, err := db.ListCareerPlayerBossInputs(ctx, database.ListCareerPlayerBossInputsParams{
					TenantID: tenant, RealmID: identity.RealmID, InstanceName: variant.Instance, DifficultyName: variant.Difficulty, MaxPlayers: variant.MaxPlayers, Bosses: variant.AverageBosses,
					PlayerGuid: identity.SubjectID, PlayerClass: identity.PlayerClass, PlayerSpec: identity.PlayerSpec, PlayerSubSpec: identity.PlayerSubSpec,
				})
				if err != nil {
					return CareerInputs{}, fmt.Errorf("career boss inputs: %w", err)
				}
				for _, row := range rows {
					add(row.Metric, row.Peak, row.Form, row.Floor, row.ObservationCount)
				}
			} else {
				rows, err := db.ListCareerGuildBossInputs(ctx, database.ListCareerGuildBossInputsParams{
					TenantID: tenant, RealmID: identity.RealmID, InstanceName: variant.Instance, DifficultyName: variant.Difficulty, MaxPlayers: variant.MaxPlayers, Bosses: variant.AverageBosses,
					GuildID: guild,
				})
				if err != nil {
					return CareerInputs{}, fmt.Errorf("career boss inputs: %w", err)
				}
				for _, row := range rows {
					add(row.Metric, row.Peak, row.Form, row.Floor, row.ObservationCount)
				}
			}
			for _, metric := range metrics {
				// Missing candidates belong to the reducer's zero-fill, not stored
				// evidence. An empty result lets the publisher remove orphan rows.
				if raids[metric].EligibleKills > 0 {
					out.Raids = append(out.Raids, *raids[metric])
				}
			}
		}
		if variant.IncludeRenown && len(variant.RenownBosses) > 0 {
			bosses := make([]string, 0, len(variant.RenownBosses))
			for _, boss := range variant.RenownBosses {
				bosses = append(bosses, boss.Name)
			}
			if identity.SubjectKind == "player" {
				rows, err := db.ListCareerPlayerRenownInputs(ctx, database.ListCareerPlayerRenownInputsParams{
					TenantID: tenant, RealmID: identity.RealmID, InstanceName: variant.Instance, DifficultyName: variant.Difficulty, MaxPlayers: variant.MaxPlayers, Bosses: bosses,
					PlayerGuid: identity.SubjectID, PlayerClass: identity.PlayerClass, PlayerSpec: identity.PlayerSpec, PlayerSubSpec: identity.PlayerSubSpec,
				})
				if err != nil {
					return CareerInputs{}, fmt.Errorf("career Renown inputs: %w", err)
				}
				for _, row := range rows {
					out.Kills = append(out.Kills, CareerBossKills{CareerKey: variant.CareerKey, Boss: row.EncounterName, Count: row.KillCount})
				}
			} else {
				rows, err := db.ListCareerGuildRenownInputs(ctx, database.ListCareerGuildRenownInputsParams{
					TenantID: tenant, RealmID: identity.RealmID, InstanceName: variant.Instance, DifficultyName: variant.Difficulty, MaxPlayers: variant.MaxPlayers, Bosses: bosses,
					GuildID: guild,
				})
				if err != nil {
					return CareerInputs{}, fmt.Errorf("career Renown inputs: %w", err)
				}
				for _, row := range rows {
					out.Kills = append(out.Kills, CareerBossKills{CareerKey: variant.CareerKey, Boss: row.EncounterName, Count: row.KillCount})
				}
			}
		}
	}
	return out, nil
}
