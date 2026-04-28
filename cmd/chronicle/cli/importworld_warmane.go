package cli

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	dbcdatacli "github.com/Emyrk/chronicle/scripts/dbcdata/cli"
	"github.com/coder/serpent"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func init() {
	serverWorldImporters["warmane"] = importWorldWarmane
}

const warmaneDataDir = "importdata/world/warmane"

type instanceBootstrapMetadata struct {
	Name         string
	Abbreviation string
	Background   string
	Category     database.InstanceCategory
}

var warmaneInstanceMetadataByScript = map[string]instanceBootstrapMetadata{
	"instance_shadowfang_keep": {Name: "Shadowfang Keep", Abbreviation: "SFK", Category: database.InstanceCategoryDungeon},
	"instance_the_stockade": {Name: "Stockade", Abbreviation: "Stocks", Category: database.InstanceCategoryDungeon},
	"instance_zulfarrak": {Name: "Zul'Farrak", Abbreviation: "ZF", Category: database.InstanceCategoryDungeon},
	"instance_the_black_morass": {Name: "Black Morass", Abbreviation: "BM", Category: database.InstanceCategoryDungeon},
	"instance_hellfire_ramparts": {Name: "Hellfire Ramparts", Category: database.InstanceCategoryDungeon},
	"instance_gruuls_lair": {Name: "Gruul's Lair", Category: database.InstanceCategoryRaid},
	"instance_ulduar": {Name: "Ulduar", Category: database.InstanceCategoryRaid},
}

var warmaneRaidMaps = map[int32]struct{}{
	249: {}, 309: {}, 409: {}, 469: {}, 509: {}, 531: {}, 532: {}, 534: {}, 544: {}, 548: {}, 550: {}, 564: {}, 565: {}, 568: {}, 580: {},
	533: {}, 603: {}, 615: {}, 616: {}, 624: {}, 631: {}, 649: {}, 724: {},
}

func prettifyInstanceScript(script string) string {
	name := strings.TrimPrefix(script, "instance_")
	parts := strings.Fields(strings.ReplaceAll(name, "_", " "))
	for i, part := range parts {
		runes := []rune(part)
		if len(runes) == 0 {
			continue
		}
		runes[0] = unicode.ToUpper(runes[0])
		for j := 1; j < len(runes); j++ {
			runes[j] = unicode.ToLower(runes[j])
		}
		parts[i] = string(runes)
	}
	return strings.Join(parts, " ")
}

func warmaneInstanceMetadata(script string, mapID int32) instanceBootstrapMetadata {
	if meta, ok := warmaneInstanceMetadataByScript[script]; ok {
		return meta
	}
	category := database.InstanceCategoryDungeon
	if _, ok := warmaneRaidMaps[mapID]; ok {
		category = database.InstanceCategoryRaid
	}
	return instanceBootstrapMetadata{
		Name:     prettifyInstanceScript(script),
		Category: category,
	}
}

func bootstrapZoneNames(name string) []string {
	if name == "" {
		return nil
	}
	return []string{strings.ToLower(name)}
}

func bootstrapWarmaneWorldInstances(ctx context.Context, pool *pgxpool.Pool, inv *serpent.Invocation) error {
	store := database.New(pool)

	scripts, err := store.ListWorldInstanceScripts(ctx)
	if err != nil {
		return err
	}
	if len(scripts) == 0 {
		_, _ = fmt.Fprintf(inv.Stderr, "no world_instance_script rows found; skipping world instance bootstrap\n")
		return nil
	}

	credits, err := store.ListWorldBossCredits(ctx)
	if err != nil {
		return err
	}
	spawns, err := store.ListWorldInstanceSpawnEntries(ctx)
	if err != nil {
		return err
	}

	bossByEntry := make(map[int32]database.WorldBossCredit, len(credits))
	for _, credit := range credits {
		if credit.CreditEntry == 0 {
			continue
		}
		if _, exists := bossByEntry[credit.CreditEntry]; !exists {
			bossByEntry[credit.CreditEntry] = credit
		}
	}

	spawnEntriesByMap := make(map[int32][]database.ListWorldInstanceSpawnEntriesRow)
	for _, spawn := range spawns {
		spawnEntriesByMap[spawn.Map] = append(spawnEntriesByMap[spawn.Map], spawn)
	}

	bootstrapped := 0
	err = store.InTx(func(tx database.Store) error {
		for _, script := range scripts {
			meta := warmaneInstanceMetadata(script.Script, script.Map)
			spawnsForMap := spawnEntriesByMap[script.Map]

			bossCount := int32(0)
			for _, spawn := range spawnsForMap {
				if _, ok := bossByEntry[spawn.EntryID]; ok {
					bossCount++
				}
			}

			abbrev := pgtype.Text{}
			if meta.Abbreviation != "" {
				abbrev = pgtype.Text{String: meta.Abbreviation, Valid: true}
			}
			background := pgtype.Text{}
			if meta.Background != "" {
				background = pgtype.Text{String: meta.Background, Valid: true}
			}
			bossCountValue := pgtype.Int4{}
			if bossCount > 0 {
				bossCountValue = pgtype.Int4{Int32: bossCount, Valid: true}
			}

			instanceTemplate, err := tx.UpsertWorldInstanceTemplate(ctx, database.UpsertWorldInstanceTemplateParams{
				Name:         meta.Name,
				Abbreviation: abbrev,
				Category:     meta.Category,
				BossCount:    bossCountValue,
				Background:   background,
				MapID:        pgtype.Int4{Int32: script.Map, Valid: true},
			})
			if err != nil {
				return err
			}

			if err := tx.DeleteWorldInstanceZoneNames(ctx, instanceTemplate.ID); err != nil {
				return err
			}
			for _, zoneName := range bootstrapZoneNames(meta.Name) {
				if err := tx.InsertWorldInstanceZoneName(ctx, database.InsertWorldInstanceZoneNameParams{
					InstanceID:  instanceTemplate.ID,
					ZoneName:    zoneName,
					DisplayName: meta.Name,
				}); err != nil {
					return err
				}
			}

			if err := tx.DeleteWorldInstanceUnits(ctx, instanceTemplate.ID); err != nil {
				return err
			}
			for _, spawn := range spawnsForMap {
				credit, isBoss := bossByEntry[spawn.EntryID]
				encounterName := pgtype.Text{}
				if isBoss && credit.Comment != "" {
					encounterName = pgtype.Text{String: credit.Comment, Valid: true}
				}
				if err := tx.UpsertWorldInstanceUnit(ctx, database.UpsertWorldInstanceUnitParams{
					InstanceID:    instanceTemplate.ID,
					EntryID:       spawn.EntryID,
					OverrideName:  pgtype.Text{},
					EncounterName: encounterName,
					Boss:          isBoss,
					Affiliation:   database.UnitAffiliationHostile,
				}); err != nil {
					return err
				}
			}

			bootstrapped++
		}
		return nil
	}, nil)
	if err != nil {
		return err
	}

	_, _ = fmt.Fprintf(inv.Stderr, "bootstrapped world instances: %d templates\n", bootstrapped)
	return nil
}

// importWorldWarmane imports world data for the Warmane server (WotLK 3.3.5a).
// Items are sourced from JSON files converted from the cmangos/wotlk-db MySQL dumps.
// See scripts/convert_cmangos_sql_to_json.py for the conversion tool.
func importWorldWarmane(ctx context.Context, pool *pgxpool.Pool, inv *serpent.Invocation, _ ImportWorldOptions) error {
	dataDir := warmaneDataDir

	detected, err := detectFiles(dataDir)
	if err != nil {
		return fmt.Errorf("detecting files: %w", err)
	}
	if len(detected) == 0 {
		return fmt.Errorf("no world data JSON files detected in %s", dataDir)
	}

	for file, table := range detected {
		_, _ = fmt.Fprintf(inv.Stderr, "detected: %s -> %s\n", file, table)
	}

	for file, table := range detected {
		filePath := filepath.Join(dataDir, file)
		n, err := importTable(ctx, pool, table, filePath)
		if err != nil {
			return fmt.Errorf("importing %s: %w", table, err)
		}
		_, _ = fmt.Fprintf(inv.Stderr, "imported %s: %d rows\n", table, n)
	}

	wowDir := dbcdatacli.DefaultClientPath("warmane")
	if wowDir != "" {
		_, _ = fmt.Fprintf(inv.Stderr, "importing DBC data from %s\n", wowDir)
		wc, err := dbcdb.New(wowDir)
		if err != nil {
			return fmt.Errorf("opening WoW client at %s: %w", wowDir, err)
		}
		if err := importDBCTables(ctx, pool, wc, inv); err != nil {
			return fmt.Errorf("importing DBC tables: %w", err)
		}
	} else {
		_, _ = fmt.Fprintf(inv.Stderr, "no WoW client path for warmane; skipping DBC import\n")
	}

	if err := fixupMultiTierSets(ctx, pool, inv); err != nil {
		return fmt.Errorf("fixing up multi-tier sets: %w", err)
	}

	if err := bootstrapWarmaneWorldInstances(ctx, pool, inv); err != nil {
		return fmt.Errorf("bootstrapping world instances: %w", err)
	}

	return nil
}
