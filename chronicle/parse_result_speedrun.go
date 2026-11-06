package chronicle

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// ParsedSpeedrunWrite holds write-time identity and rankability decisions.
// The caller owns the transaction and parse-generation fence.
type ParsedSpeedrunWrite struct {
	InstanceID, RealmID uuid.UUID
	GuildID             uuid.NullUUID
	Rankable            bool
}

// InsertParsedSpeedrun writes only the speedrun slice for an existing instance.
// A nil speedrun, trash-only run, or invalidated (unrankable) log has no row.
func InsertParsedSpeedrun(ctx context.Context, store database.Store, result parseresult.Result, write ParsedSpeedrunWrite) error {
	if result.SchemaVersion != 8 || !supportedParsedAddonFormat(result.Format) {
		return fmt.Errorf("unsupported speedrun parse result schema %d format %q", result.SchemaVersion, result.Format)
	}
	sr := result.Speedrun
	if !write.Rankable || sr == nil || !sr.HasBossKill {
		return nil
	}
	if write.InstanceID == uuid.Nil || write.RealmID == uuid.Nil || result.Name == "" {
		return fmt.Errorf("speedrun insert requires instance, realm and name")
	}
	proof, err := json.Marshal(sr.Proof)
	if err != nil {
		return fmt.Errorf("marshal speedrun proof: %w", err)
	}
	params := database.InsertInstanceSpeedrunParams{
		InstanceID: write.InstanceID, RealmID: write.RealmID, GuildID: write.GuildID,
		InstanceName: result.Name, Qualified: sr.Qualified && (sr.ServerSide || sr.AddonVersion != ""),
		StartTime: database.Timestamptz(sr.StartTime), CompletionTime: database.Timestamptz(sr.CompletionTime),
		DurationMs: sr.DurationMs, Proof: proof, AddonVersion: sr.AddonVersion,
	}
	if sr.Ranked != nil {
		params.RankedStartTime = database.Timestamptz(sr.Ranked.StartTime)
		params.RankedCompletionTime = database.Timestamptz(sr.Ranked.CompletionTime)
		params.RankedDurationMs = pgtype.Int8{Int64: sr.Ranked.DurationMs, Valid: true}
	}
	if sr.BossToBoss != nil {
		params.BossToBossStartTime = database.Timestamptz(sr.BossToBoss.StartTime)
		params.BossToBossCompletionTime = database.Timestamptz(sr.BossToBoss.CompletionTime)
		params.BossToBossDurationMs = pgtype.Int8{Int64: sr.BossToBoss.DurationMs, Valid: true}
	}
	if err := store.InsertInstanceSpeedrun(ctx, params); err != nil {
		return fmt.Errorf("insert parsed speedrun: %w", err)
	}
	return nil
}
