// Package leaderboardconfig resolves shared configuration only. It never reads
// tenant evidence or changes parser/UI policy. All inheritance happens in SQL.
package leaderboardconfig

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/database"
)

var ErrConflict = errors.New("conflicting leaderboard configuration")

type Store interface {
	ResolveLeaderboardConfiguration(context.Context, []string) ([]database.ResolveLeaderboardConfigurationRow, error)
}

// Resolve projects the dataset plus tenant flavor union. Unknown/server tags
// cannot select layers. Unconfigured awards are distinguished by HasPoints.
// Conflict diagnostics are never exposed as a successful partial configuration.
func Resolve(ctx context.Context, db Store, dataset, tenant database.WoWFlavor) ([]database.ResolveLeaderboardConfigurationRow, error) {
	rows, err := db.ResolveLeaderboardConfiguration(ctx, dataset.Merge(tenant).LeaderboardFlavors().Strings())
	if err != nil {
		return nil, fmt.Errorf("resolve leaderboard configuration: %w", err)
	}
	for _, row := range rows {
		if row.Kind == "conflict" {
			return nil, fmt.Errorf("%w: %s (%s)", ErrConflict, row.EncounterName, row.ConflictingProperty)
		}
	}
	return rows, nil
}
