package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

func (q *sqlQuerier) withJITDisabled(ctx context.Context, query func(Store) error) error {
	return q.InTx(ctx, func(tx Store) error {
		if err := tx.DisableJITForTransaction(ctx); err != nil {
			return fmt.Errorf("disable JIT for transaction: %w", err)
		}
		return query(tx)
	}, &pgx.TxOptions{AccessMode: pgx.ReadOnly})
}

// RankingsLeaderboardNoJIT runs RankingsLeaderboard without PostgreSQL JIT.
// The ranking query is too short-lived to recover its substantial compilation cost.
func (q *sqlQuerier) RankingsLeaderboardNoJIT(ctx context.Context, arg RankingsLeaderboardParams) ([]RankingsLeaderboardRow, error) {
	var rows []RankingsLeaderboardRow
	err := q.withJITDisabled(ctx, func(tx Store) error {
		var err error
		rows, err = tx.RankingsLeaderboard(ctx, arg)
		return err
	})
	return rows, err
}

// RankingsBoxPlotStatsNoJIT runs RankingsBoxPlotStats without PostgreSQL JIT.
// The ranking query is too short-lived to recover its substantial compilation cost.
func (q *sqlQuerier) RankingsBoxPlotStatsNoJIT(ctx context.Context, arg RankingsBoxPlotStatsParams) ([]RankingsBoxPlotStatsRow, error) {
	var rows []RankingsBoxPlotStatsRow
	err := q.withJITDisabled(ctx, func(tx Store) error {
		var err error
		rows, err = tx.RankingsBoxPlotStats(ctx, arg)
		return err
	})
	return rows, err
}
