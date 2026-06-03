package gamedataapi

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/wdb"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxSQLFileSize = 200 * 1024 * 1024 // 200 MB
// allowedSQLHosts restricts which hosts the server will fetch SQL dumps from.
var allowedSQLHosts = map[string]bool{
	"raw.githubusercontent.com": true,
}

func (h *Handler) ImportSQLFromURL(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "compare"
	}
	if mode != "compare" && mode != "upsert" && mode != "insert" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid mode, must be 'compare', 'upsert', or 'insert'",
		})
		return
	}

	table := r.URL.Query().Get("table")
	if table == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Missing 'table' query parameter (e.g. 'creature_template')",
		})
		return
	}

	datasetID, ok := datasetIDFromQuery(ctx, w, r)
	if !ok {
		return
	}

	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Missing 'url' query parameter",
		})
		return
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || !allowedSQLHosts[parsed.Host] {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("URL host not allowed, must be one of: %s", allowedSQLHostList()),
		})
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid URL",
			Detail:  err.Error(),
		})
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadGateway, chroniclesdk.Response{
			Message: "Failed to fetch SQL file from URL",
			Detail:  err.Error(),
		})
		return
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		httpapi.Write(ctx, w, http.StatusBadGateway, chroniclesdk.Response{
			Message: fmt.Sprintf("Remote server returned %d", resp.StatusCode),
		})
		return
	}

	body := io.LimitReader(resp.Body, maxSQLFileSize+1)

	switch table {
	case "creature_template":
		h.importCreatureTemplateSQL(ctx, w, mode, body, datasetID)
	case "item_template":
		h.importItemTemplateSQL(ctx, w, mode, body, datasetID)
	default:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("Unsupported table %q, supported: creature_template, item_template", table),
		})
	}
}

func allowedSQLHostList() string {
	hosts := make([]string, 0, len(allowedSQLHosts))
	for h := range allowedSQLHosts {
		hosts = append(hosts, h)
	}
	return strings.Join(hosts, ", ")
}

func (h *Handler) ImportSQL(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "compare"
	}
	if mode != "compare" && mode != "upsert" && mode != "insert" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid mode, must be 'compare', 'upsert', or 'insert'",
		})
		return
	}

	table := r.URL.Query().Get("table")
	if table == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Missing 'table' query parameter (e.g. 'creature_template')",
		})
		return
	}

	datasetID, ok := datasetIDFromQuery(ctx, w, r)
	if !ok {
		return
	}

	file, header, err := r.FormFile("sql_file")
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get sql_file from form",
			Detail:  err.Error(),
		})
		return
	}
	defer func() { _ = file.Close() }()

	if header.Size > maxSQLFileSize {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("File too large (%d bytes), maximum is %d bytes", header.Size, maxSQLFileSize),
		})
		return
	}

	switch table {
	case "creature_template":
		h.importCreatureTemplateSQL(ctx, w, mode, file, datasetID)
	case "item_template":
		h.importItemTemplateSQL(ctx, w, mode, file, datasetID)
	default:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("Unsupported table %q, supported: creature_template, item_template", table),
		})
	}
}

func (h *Handler) importCreatureTemplateSQL(ctx context.Context, w http.ResponseWriter, mode string, file io.Reader, datasetID uuid.UUID) {
	creatures, err := wdb.ParseCreatureTemplateSQL(file)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to parse SQL dump",
			Detail:  err.Error(),
		})
		return
	}

	if len(creatures) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "No creature_template INSERT statements found in file",
		})
		return
	}

	// Batch-fetch existing rows from DB.
	entries := make([]int32, len(creatures))
	for i, c := range creatures {
		entries[i] = c.Entry
	}
	existingRows, err := h.zed.GetCreatureTemplatesByEntries(ctx, database.GetCreatureTemplatesByEntriesParams{DatasetID: datasetID, Entries: entries})
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
		dbRow, exists := existingByEntry[c.Entry]

		if !exists {
			newCount++
			diffs = append(diffs, chroniclesdk.WDBItemDiff{
				Entry:  c.Entry,
				Name:   c.Name,
				Status: "new",
			})
			if mode == "upsert" || mode == "insert" {
				toUpsert = append(toUpsert, c)
			}
			continue
		}

		fieldDiffs := wdb.CompareCreaturesFull(c, dbRow)
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
			Entry:  c.Entry,
			Name:   c.Name,
			Status: "changed",
			Fields: sdkFields,
		})
		if mode == "upsert" {
			toUpsert = append(toUpsert, c)
		}
	}

	if (mode == "upsert" || mode == "insert") && len(toUpsert) > 0 {
		if err := upsertCreaturesSQL(ctx, h.pool, datasetID, toUpsert); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to upsert creatures",
				Detail:  err.Error(),
			})
			return
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.WDBUploadResponse{
		Signature:   "creature_template",
		Version:     0,
		RecordCount: len(creatures),
		Mode:        mode,
		NewItems:    newCount,
		Changed:     changed,
		Unchanged:   unchanged,
		Diffs:       diffs,
	})
}

func (h *Handler) importItemTemplateSQL(ctx context.Context, w http.ResponseWriter, mode string, file io.Reader, datasetID uuid.UUID) {
	items, err := wdb.ParseItemTemplateSQL(file)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to parse SQL dump",
			Detail:  err.Error(),
		})
		return
	}

	if len(items) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "No item_template INSERT statements found in file",
		})
		return
	}

	entries := make([]int32, len(items))
	for i, it := range items {
		entries[i] = it.Entry
	}
	existingRows, err := h.zed.GetItemTemplatesByEntries(ctx, database.GetItemTemplatesByEntriesParams{DatasetID: datasetID, Entries: entries})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to fetch existing items from database",
			Detail:  err.Error(),
		})
		return
	}
	existingByEntry := make(map[int32]database.WorldItemTemplate, len(existingRows))
	for _, row := range existingRows {
		existingByEntry[row.Entry] = row
	}

	var (
		diffs     []chroniclesdk.WDBItemDiff
		newCount  int
		changed   int
		unchanged int
	)
	var toUpsert []database.WorldItemTemplate

	for _, it := range items {
		dbRow, exists := existingByEntry[it.Entry]

		if !exists {
			newCount++
			diffs = append(diffs, chroniclesdk.WDBItemDiff{
				Entry:  it.Entry,
				Name:   it.Name,
				Status: "new",
			})
			if mode == "upsert" || mode == "insert" {
				toUpsert = append(toUpsert, it)
			}
			continue
		}

		fieldDiffs := wdb.CompareItems(it, dbRow)
		if len(fieldDiffs) == 0 {
			unchanged++
			continue
		}

		hasReliableDiff := false
		for _, fd := range fieldDiffs {
			if !fd.Unreliable {
				hasReliableDiff = true
				break
			}
		}
		if !hasReliableDiff {
			unchanged++
		} else {
			changed++
		}
		sdkFields := make([]chroniclesdk.WDBFieldDiff, len(fieldDiffs))
		for i, fd := range fieldDiffs {
			sdkFields[i] = chroniclesdk.WDBFieldDiff{
				Field:      fd.Field,
				Old:        fd.Old,
				New:        fd.New,
				Unreliable: fd.Unreliable,
			}
		}
		status := "changed"
		if !hasReliableDiff {
			status = "unchanged"
		}
		diffs = append(diffs, chroniclesdk.WDBItemDiff{
			Entry:  it.Entry,
			Name:   it.Name,
			Status: status,
			Fields: sdkFields,
		})
		if mode == "upsert" && hasReliableDiff {
			toUpsert = append(toUpsert, it)
		}
	}

	if (mode == "upsert" || mode == "insert") && len(toUpsert) > 0 {
		if err := upsertItems(ctx, h.pool, datasetID, toUpsert); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to upsert items",
				Detail:  err.Error(),
			})
			return
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.WDBUploadResponse{
		Signature:   "item_template",
		Version:     0,
		RecordCount: len(items),
		Mode:        mode,
		NewItems:    newCount,
		Changed:     changed,
		Unchanged:   unchanged,
		Diffs:       diffs,
	})
}

// sqlCreatureUpsertColumns includes all fields available from AzerothCore SQL dumps.
var sqlCreatureUpsertColumns = []string{
	"dataset_id", "entry", "name", "subname",
	"display_id1", "display_id2", "display_id3", "display_id4",
	"level_min", "level_max",
	"dmg_min", "dmg_max", "dmg_school", "attack_power", "dmg_multiplier",
	"base_attack_time", "ranged_attack_time",
	"unit_class", "unit_flags",
	"ranged_dmg_min", "ranged_dmg_max",
	"holy_res", "fire_res", "nature_res", "frost_res", "shadow_res", "arcane_res",
	"mechanic_immune_mask",
}

var upsertCreatureSQLStmt string

func init() {
	placeholders := make([]string, len(sqlCreatureUpsertColumns))
	for i := range sqlCreatureUpsertColumns {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}
	var setClauses []string
	for _, col := range sqlCreatureUpsertColumns[2:] { // skip "dataset_id" and "entry" (composite PK)
		setClauses = append(setClauses, fmt.Sprintf("%s = EXCLUDED.%s", col, col))
	}
	upsertCreatureSQLStmt = fmt.Sprintf(
		"INSERT INTO world_creature_template (%s) VALUES (%s) ON CONFLICT (dataset_id, entry) DO UPDATE SET %s",
		strings.Join(sqlCreatureUpsertColumns, ", "),
		strings.Join(placeholders, ", "),
		strings.Join(setClauses, ", "),
	)
}

func sqlCreatureRowArgs(datasetID uuid.UUID, r database.WorldCreatureTemplate) []any {
	return []any{
		datasetID,
		r.Entry, r.Name, r.Subname,
		r.DisplayId1, r.DisplayId2, r.DisplayId3, r.DisplayId4,
		r.LevelMin, r.LevelMax,
		r.DmgMin, r.DmgMax, r.DmgSchool, r.AttackPower, r.DmgMultiplier,
		r.BaseAttackTime, r.RangedAttackTime,
		r.UnitClass, r.UnitFlags,
		r.RangedDmgMin, r.RangedDmgMax,
		r.HolyRes, r.FireRes, r.NatureRes, r.FrostRes, r.ShadowRes, r.ArcaneRes,
		r.MechanicImmuneMask,
	}
}

func upsertCreaturesSQL(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, rows []database.WorldCreatureTemplate) error {
	const batchSize = 500
	for i := 0; i < len(rows); i += batchSize {
		end := min(i+batchSize, len(rows))
		batch := &pgx.Batch{}
		for _, r := range rows[i:end] {
			batch.Queue(upsertCreatureSQLStmt, sqlCreatureRowArgs(datasetID, r)...)
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
