package chronicle

import (
	"context"
	"fmt"
	"math"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// ParsedCoreWrite contains decisions that cannot be derived from a parse result.
// The caller owns the parse-generation fence and transaction, and must supply
// realm/guild resolution and the intended slug variants.
type ParsedCoreWrite struct {
	InstanceID, RealmID, LogGroupID uuid.UUID
	GuildID                         uuid.NullUUID
	ParserVersion                   string
	InvalidatedAt                   pgtype.Timestamptz
	InvalidReason                   string
	VariantSlug, OrdinalSlug        string
}

// InsertParsedCore persists only the core instance, overview, encounters,
// hostiles, phases, raid snapshots and non-player observed units. It does NOT
// write events, loot, players (class/race/level are absent), guilds, armory,
// rankings or other parser side effects. Use a transactional store: a write
// failure after the instance insert must roll back the entire operation.
func InsertParsedCore(ctx context.Context, store database.Store, result parseresult.Result, write ParsedCoreWrite) (database.LogInstance, error) {
	if result.SchemaVersion != 2 || result.Format != database.LogFormat112aCcAddon {
		return database.LogInstance{}, fmt.Errorf("unsupported core parse result schema %d format %q", result.SchemaVersion, result.Format)
	}
	if write.InstanceID == uuid.Nil || write.RealmID == uuid.Nil || write.LogGroupID == uuid.Nil || write.ParserVersion == "" || result.Name == "" || result.Core.Start.IsZero() || result.Core.End.IsZero() {
		return database.LogInstance{}, fmt.Errorf("core insert requires instance, realm, log group, parser version, name and time range")
	}
	// Validate transport identifiers before the first write.
	type encounterRows struct {
		id        uuid.UUID
		remaining []guid.GUID
		fights    []database.InsertEncounterCharacterFightsParams
		phases    []database.InsertEncounterPhaseParams
	}
	parsed := make([]encounterRows, len(result.Encounters))
	parseGUID := func(s string) (guid.GUID, error) { return guid.FromString(s) }
	for i, enc := range result.Encounters {
		var err error
		parsed[i].id, err = uuid.Parse(enc.ID)
		if err != nil {
			return database.LogInstance{}, fmt.Errorf("encounter %d id: %w", i, err)
		}
		if enc.MapID > math.MaxInt32 {
			return database.LogInstance{}, fmt.Errorf("encounter %d map id exceeds int32", i)
		}
		parsed[i].remaining = make([]guid.GUID, 0, len(enc.Remaining))
		for _, raw := range enc.Remaining {
			id, err := parseGUID(raw)
			if err != nil {
				return database.LogInstance{}, fmt.Errorf("encounter %d remaining: %w", i, err)
			}
			parsed[i].remaining = append(parsed[i].remaining, id)
		}
		for _, fight := range enc.Fights {
			id, err := parseGUID(fight.GUID)
			if err != nil {
				return database.LogInstance{}, fmt.Errorf("encounter %d hostile: %w", i, err)
			}
			periods := make(database.Periods, 0, len(fight.Periods))
			moment := func(m *parseresult.FightMoment) *database.PeriodMoment {
				if m == nil {
					return nil
				}
				return &database.PeriodMoment{Timestamp: m.Timestamp, Reason: m.Reason, MessageType: m.MessageType, Message: m.Message}
			}
			for _, p := range fight.Periods {
				periods = append(periods, database.Period{Start: moment(p.Start), End: moment(p.End), LastActive: moment(p.LastActive), EndState: database.EndState(p.EndState)})
			}
			parsed[i].fights = append(parsed[i].fights, database.InsertEncounterCharacterFightsParams{ID: id, Boss: fight.Boss, EncounterID: parsed[i].id, Periods: periods})
		}
		for _, phase := range enc.Phases {
			id, err := uuid.Parse(phase.ID)
			if err != nil {
				return database.LogInstance{}, fmt.Errorf("encounter %d phase: %w", i, err)
			}
			parsed[i].phases = append(parsed[i].phases, database.InsertEncounterPhaseParams{ID: id, EncounterID: parsed[i].id, Key: phase.Key, Name: phase.Name, PhaseOrder: phase.Order, StartOffsetMs: phase.StartOffsetMs, EndOffsetMs: phase.EndOffsetMs, KillType: database.KillType(phase.KillType)})
		}
	}
	snapshots := make([]database.InsertInstanceRaidGroupSnapshotParams, 0, len(result.RaidSnapshots))
	for i, snap := range result.RaidSnapshots {
		row := database.InsertInstanceRaidGroupSnapshotParams{InstanceID: write.InstanceID, SnapshotType: database.RaidGroupSnapshotTypeFinal, ObservedAt: database.Timestamptz(snap.ObservedAt)}
		if snap.EncounterID != nil {
			id, err := uuid.Parse(*snap.EncounterID)
			if err != nil {
				return database.LogInstance{}, fmt.Errorf("snapshot %d encounter: %w", i, err)
			}
			row.EncounterID = uuid.NullUUID{UUID: id, Valid: true}
			row.SnapshotType = database.RaidGroupSnapshotTypeCleanKill
		}
		var composition raidgroups.Composition
		for g := range composition {
			for m := range composition[g] {
				id, err := parseGUID(snap.Composition[g][m])
				if err != nil {
					return database.LogInstance{}, fmt.Errorf("snapshot %d composition [%d][%d]: %w", i, g, m, err)
				}
				composition[g][m] = id
			}
		}
		row.Composition = composition
		snapshots = append(snapshots, row)
	}
	units := make([]database.InsertInstanceUnitsParams, 0, len(result.Units))
	for i, unit := range result.Units {
		id, err := parseGUID(unit.GUID)
		if err != nil {
			return database.LogInstance{}, fmt.Errorf("unit %d guid: %w", i, err)
		}
		if id == 0 {
			continue
		}
		if unit.Player != id.IsPlayer() {
			return database.LogInstance{}, fmt.Errorf("unit %d player flag conflicts with GUID", i)
		}
		if unit.Player {
			if unit.Participating {
				return database.LogInstance{}, fmt.Errorf("unit %d participating player requires class/race/level data", i)
			}
			continue
		}
		entry, _ := id.GetEntry()
		if unit.Entry != entry {
			return database.LogInstance{}, fmt.Errorf("unit %d entry conflicts with GUID", i)
		}
		row := database.InsertInstanceUnitsParams{InstanceID: write.InstanceID, UnitGuid: id, Name: unit.Name, Entry: int32(entry)}
		if unit.OwnerGUID != nil {
			owner, err := parseGUID(*unit.OwnerGUID)
			if err != nil {
				return database.LogInstance{}, fmt.Errorf("unit %d owner: %w", i, err)
			}
			row.OwnerGuid = &owner
		}
		units = append(units, row)
	}
	category := pgtype.Text{}
	if result.Core.Category != "" {
		category = pgtype.Text{String: result.Core.Category, Valid: true}
	}
	instance, err := insertInstanceWithSlugFallback(ctx, store.InsertInstance, database.InsertInstanceParams{
		ID: write.InstanceID, RealmID: write.RealmID, LogGroupID: write.LogGroupID, Name: result.Name,
		HashedSlug: pgtype.Text{String: database.InstanceSlug(write.LogGroupID, result.Name), Valid: true}, GuildID: write.GuildID,
		StartTime: database.Timestamptz(result.Core.Start), EndTime: database.Timestamptz(result.Core.End),
		Capabilities: result.Core.Capabilities, Versions: database.VersionsMap(result.Versions),
		RecorderName: result.RecorderName, RecorderGuid: result.RecorderGUID, ParserVersion: write.ParserVersion,
		DifficultyName: result.Core.DifficultyName, MaxPlayers: result.Core.MaxPlayers, DynamicDifficulty: result.Core.DynamicDifficulty,
		Category: category, VehicleControlIntervals: result.Core.VehicleMetadata, InvalidatedAt: write.InvalidatedAt, InvalidReason: write.InvalidReason,
	}, write.VariantSlug, write.OrdinalSlug)
	if err != nil {
		return database.LogInstance{}, fmt.Errorf("insert parsed instance: %w", err)
	}
	overview := result.Overview
	abilities := make([]database.OverviewIncomingDamageAbility, 0, len(overview.TopIncomingDamageAbilities))
	for _, a := range overview.TopIncomingDamageAbilities {
		abilities = append(abilities, database.OverviewIncomingDamageAbility{SpellID: a.SpellID, Name: a.Name, Damage: a.Damage, Hits: a.Hits, EnvironmentType: a.EnvironmentType})
	}
	complete := pgtype.Bool{}
	if overview.RequirementsComplete != nil {
		complete = pgtype.Bool{Bool: *overview.RequirementsComplete, Valid: true}
	}
	if err := store.UpsertInstanceOverviewMetrics(ctx, database.UpsertInstanceOverviewMetricsParams{InstanceID: instance.ID, RequirementsComplete: complete, PlayerDeaths: overview.PlayerDeaths, WipeCount: overview.WipeCount, TopIncomingDamageAbilities: abilities, EncounterSpanDurationMs: overview.EncounterSpanDurationMs, TotalCombatDurationMs: overview.TotalCombatDurationMs, TotalBossDurationMs: overview.TotalBossDurationMs, MetricsVersion: overview.MetricsVersion}); err != nil {
		return database.LogInstance{}, fmt.Errorf("insert parsed overview: %w", err)
	}
	for i, enc := range result.Encounters {
		if err := ctx.Err(); err != nil {
			return database.LogInstance{}, err
		}
		var start, end pgtype.Int8
		if enc.RankingStartOffsetMs != nil {
			start = pgtype.Int8{Int64: *enc.RankingStartOffsetMs, Valid: true}
		}
		if enc.RankingEndOffsetMs != nil {
			end = pgtype.Int8{Int64: *enc.RankingEndOffsetMs, Valid: true}
		}
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{ID: parsed[i].id, InstanceID: instance.ID, Name: enc.Name, MapID: int32(enc.MapID), KillType: database.KillType(enc.KillType), Remaining: parsed[i].remaining, Boss: enc.Boss, RankingStartOffsetMs: start, RankingEndOffsetMs: end, StartTime: database.Timestamptz(enc.Start), EndTime: database.Timestamptz(enc.End)})
		if err != nil {
			return database.LogInstance{}, fmt.Errorf("insert parsed encounter %d: %w", i, err)
		}
		if err := store.InsertEncounterCharacterFights(ctx, parsed[i].fights).Close(); err != nil {
			return database.LogInstance{}, fmt.Errorf("insert parsed fights %d: %w", i, err)
		}
		for _, phase := range parsed[i].phases {
			if err := store.InsertEncounterPhase(ctx, phase); err != nil {
				return database.LogInstance{}, fmt.Errorf("insert parsed phase %q: %w", phase.Key, err)
			}
		}
	}
	for _, snap := range snapshots {
		if err := store.InsertInstanceRaidGroupSnapshot(ctx, snap); err != nil {
			return database.LogInstance{}, fmt.Errorf("insert parsed raid snapshot: %w", err)
		}
	}
	if err := store.InsertInstanceUnits(ctx, units).Close(); err != nil {
		return database.LogInstance{}, fmt.Errorf("insert parsed units: %w", err)
	}
	return instance, nil
}
