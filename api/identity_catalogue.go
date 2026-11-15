package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type identityCatalogueQuery struct {
	Review        string
	After         guid.GUID
	HasAfter      bool
	Generation    int64
	HasGeneration bool
	Limit         int32
}

func parseIdentityCatalogueQuery(values url.Values) (identityCatalogueQuery, error) {
	q := identityCatalogueQuery{Review: "all", Limit: 100}
	if v := values.Get("review"); v != "" {
		q.Review = v
	}
	if q.Review != "all" && q.Review != "unknown" && q.Review != "conflicts" {
		return q, errors.New("review must be all, unknown, or conflicts")
	}
	if v := values.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 500 {
			return q, errors.New("limit must be between 1 and 500")
		}
		q.Limit = int32(n)
	}
	if v := values.Get("generation"); v != "" {
		g, err := strconv.ParseInt(v, 10, 64)
		if err != nil || g <= 0 {
			return q, errors.New("generation must be a positive integer")
		}
		q.Generation, q.HasGeneration = g, true
	}
	if v := values.Get("after"); v != "" {
		g, err := guid.FromString(v)
		if err != nil {
			return q, errors.New("invalid after GUID")
		}
		q.After, q.HasAfter = g, true
		if !q.HasGeneration {
			return q, errors.New("generation is required with after")
		}
	}
	return q, nil
}

func (api *API) WoWLogIdentityCatalogue(w http.ResponseWriter, r *http.Request) {
	api.identityCatalogue(w, r, false)
}

func (api *API) WoWLogIdentityCatalogueDownload(w http.ResponseWriter, r *http.Request) {
	api.identityCatalogue(w, r, true)
}

func (api *API) identityCatalogue(w http.ResponseWriter, r *http.Request, download bool) {
	ctx := r.Context()
	logID := httpmw.LogID(ctx)
	actor, _ := authz.ActorFromContext(ctx)
	// These queries are deliberately raw Store methods. Require both permissions
	// before accessing them; global log administration does not replace log visibility.
	allowed, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logID).CanView_User(actor))
	if err != nil || !allowed {
		httpapi.Forbidden(w, err)
		return
	}
	allowed, err = api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_logs_User(actor))
	if err != nil || !allowed {
		httpapi.Forbidden(w, err)
		return
	}
	q, err := parseIdentityCatalogueQuery(r.URL.Query())
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return
	}
	result, err := readIdentityCatalogue(ctx, database.New(api.Opts.Pool), logID, q, download)
	if errors.Is(err, errIdentityCatalogueReplaced) {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: "Identity catalogue was replaced; restart pagination."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	if download {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="identity-catalogue-%s.json"`, logID))
	}
	httpapi.Write(ctx, w, http.StatusOK, result)
}

var errIdentityCatalogueReplaced = errors.New("identity catalogue generation changed")

func readIdentityCatalogue(ctx context.Context, db database.Store, logID uuid.UUID, q identityCatalogueQuery, download bool) (chroniclesdk.IdentityCatalogueResponse, error) {
	result := chroniclesdk.IdentityCatalogueResponse{Records: make([]chroniclesdk.IdentityCatalogueRecord, 0)}
	err := db.InTx(ctx, func(tx database.Store) error {
		// InTx may retry; never retain a prior attempt's rows or cursor.
		result = chroniclesdk.IdentityCatalogueResponse{Records: make([]chroniclesdk.IdentityCatalogueRecord, 0)}
		header, err := tx.GetLogIdentityCatalogue(ctx, logID)
		if errors.Is(err, pgx.ErrNoRows) {
			if q.HasGeneration {
				return errIdentityCatalogueReplaced
			}
			return nil
		}
		if err != nil {
			return err
		}
		if q.HasGeneration && q.Generation != header.Generation {
			return errIdentityCatalogueReplaced
		}
		result.Catalogue = identityCatalogueHeader(header)
		var rows []database.LogIdentityCatalogueRecord
		if download {
			rows, err = tx.DownloadLogIdentityCatalogueRecords(ctx, logID)
		} else {
			rows, err = tx.ListLogIdentityCatalogueRecords(ctx, database.ListLogIdentityCatalogueRecordsParams{LogGroupID: logID, HasAfter: q.HasAfter, AfterGuid: q.After, Review: q.Review, RowLimit: q.Limit + 1})
		}
		if err != nil {
			return err
		}
		if !download && len(rows) > int(q.Limit) {
			rows = rows[:q.Limit]
			result.NextAfter = rows[len(rows)-1].Guid.String()
		}
		for _, row := range rows {
			var record chroniclesdk.IdentityCatalogueRecord
			if err := json.Unmarshal(row.Payload, &record); err != nil {
				return fmt.Errorf("decode identity %s: %w", row.Guid, err)
			}
			result.Records = append(result.Records, record)
		}
		return nil
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	return result, err
}

func identityCatalogueHeader(h database.LogIdentityCatalogue) *chroniclesdk.IdentityCatalogueHeader {
	timestamp := func(t pgtype.Timestamptz) *time.Time {
		if !t.Valid {
			return nil
		}
		return &t.Time
	}
	return &chroniclesdk.IdentityCatalogueHeader{
		LogGroupID: h.LogGroupID, Generation: h.Generation, DatasetID: h.DatasetID, DatasetRevision: h.DatasetRevision,
		Format: h.Format, Flavor: h.Flavor, ParserEngine: h.ParserEngine, ParserBuild: h.ParserBuild,
		CatalogueVersion: h.CatalogueVersion, RuleVersion: h.RuleVersion, FirstSeen: timestamp(h.FirstSeen), LastSeen: timestamp(h.LastSeen),
		GUIDCount: h.GuidCount, EventCount: h.EventCount, ZeroGUIDCount: h.ZeroGuidCount, CreatedAt: h.CreatedAt.Time,
	}
}
