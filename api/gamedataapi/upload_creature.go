package gamedataapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/wdb"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func (h *Handler) handleCreatureUpload(ctx context.Context, w http.ResponseWriter, mode string, wdbHeader wdb.Header, records []wdb.Record) {
	creatures := make([]wdb.Creature, 0, len(records))
	for _, rec := range records {
		c, err := wdb.ParseCreature(rec)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: fmt.Sprintf("Failed to parse creature entry %d", rec.EntryID),
				Detail:  err.Error(),
			})
			return
		}
		creatures = append(creatures, c)
	}

	entries := make([]int32, len(creatures))
	for i, c := range creatures {
		entries[i] = int32(c.Entry)
	}
	existingRows, err := h.zed.GetCreatureTemplatesByEntries(ctx, entries)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to fetch existing creatures from database",
			Detail:  err.Error(),
		})
		return
	}
	existingByEntry := make(map[int32]database.WorldCreatureTemplate, len(existingRows))
	for _, row := range existingRows {
		existingByEntry[row.Entry] = row
	}

	var (
		diffs     []chroniclesdk.WDBItemDiff
		newCount  int
		changed   int
		unchanged int
	)
	var toUpsert []database.WorldCreatureTemplate

	for _, c := range creatures {
		wdbRow := wdb.CreatureToWorldTemplate(c)
		dbRow, exists := existingByEntry[int32(c.Entry)]

		if !exists {
			newCount++
			diffs = append(diffs, chroniclesdk.WDBItemDiff{
				Entry:  int32(c.Entry),
				Name:   c.Name,
				Status: "new",
			})
			if mode == "upsert" || mode == "insert" {
				toUpsert = append(toUpsert, wdbRow)
			}
			continue
		}

		fieldDiffs := wdb.CompareCreatures(wdbRow, dbRow)
		if len(fieldDiffs) == 0 {
			unchanged++
			continue
		}

		changed++
		sdkFields := make([]chroniclesdk.WDBFieldDiff, len(fieldDiffs))
		for i, fd := range fieldDiffs {
			sdkFields[i] = chroniclesdk.WDBFieldDiff{
				Field: fd.Field,
				Old:   fd.Old,
				New:   fd.New,
			}
		}
		diffs = append(diffs, chroniclesdk.WDBItemDiff{
			Entry:  int32(c.Entry),
			Name:   c.Name,
			Status: "changed",
			Fields: sdkFields,
		})
		if mode == "upsert" {
			toUpsert = append(toUpsert, wdbRow)
		}
	}

	if (mode == "upsert" || mode == "insert") && len(toUpsert) > 0 {
		if err := upsertCreatures(ctx, h.pool, toUpsert); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to upsert creatures",
				Detail:  err.Error(),
			})
			return
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.WDBUploadResponse{
		Signature:   wdbHeader.Signature.String(),
		Version:     wdbHeader.Version,
		RecordCount: len(records),
		Mode:        mode,
		NewItems:    newCount,
		Changed:     changed,
		Unchanged:   unchanged,
		Diffs:       diffs,
	})
}

// creatureUpsertColumns are the WDB-sourced columns for creature upsert.
// The creature cache only provides name, subname, and display IDs.
// Combat stats (health, damage, armor, resistances) are server-side only.
var creatureUpsertColumns = []string{
	"entry", "name", "subname",
	"display_id1", "display_id2", "display_id3", "display_id4",
}

var upsertCreatureSQL string

func init() {
	placeholders := make([]string, len(creatureUpsertColumns))
	for i := range creatureUpsertColumns {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}

	var setClauses []string
	for _, col := range creatureUpsertColumns[1:] {
		setClauses = append(setClauses, fmt.Sprintf("%s = EXCLUDED.%s", col, col))
	}

	upsertCreatureSQL = fmt.Sprintf(
		"INSERT INTO world_creature_template (%s) VALUES (%s) ON CONFLICT (entry) DO UPDATE SET %s",
		strings.Join(creatureUpsertColumns, ", "),
		strings.Join(placeholders, ", "),
		strings.Join(setClauses, ", "),
	)
}

func creatureRowArgs(r database.WorldCreatureTemplate) []any {
	return []any{
		r.Entry, r.Name, r.Subname,
		r.DisplayId1, r.DisplayId2, r.DisplayId3, r.DisplayId4,
	}
}

func upsertCreatures(ctx context.Context, pool *pgxpool.Pool, rows []database.WorldCreatureTemplate) error {
	const batchSize = 500
	for i := 0; i < len(rows); i += batchSize {
		end := min(i+batchSize, len(rows))
		batch := &pgx.Batch{}
		for _, r := range rows[i:end] {
			batch.Queue(upsertCreatureSQL, creatureRowArgs(r)...)
		}
		br := pool.SendBatch(ctx, batch)
		for range rows[i:end] {
			if _, err := br.Exec(); err != nil {
				_ = br.Close()
				return fmt.Errorf("upsert creature batch: %w", err)
			}
		}
		if err := br.Close(); err != nil {
			return fmt.Errorf("close batch: %w", err)
		}
	}
	return nil
}
