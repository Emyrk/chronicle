package api

import (
	"encoding/json"
	"errors"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identitycatalog"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/go-chi/chi/v5"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestIdentityCatalogueQuery(t *testing.T) {
	t.Parallel()
	q, err := parseIdentityCatalogueQuery(url.Values{})
	require.NoError(t, err)
	require.EqualValues(t, 100, q.Limit)
	require.Equal(t, "all", q.Review)
	for _, query := range []string{"limit=0", "limit=501", "limit=abc", "review=bad", "generation=bad", "generation=0", "generation=-1", "generation=9223372036854775808", "after=bad", "after=0x0000000000000000"} {
		values, err := url.ParseQuery(query)
		require.NoError(t, err)
		_, err = parseIdentityCatalogueQuery(values)
		require.Error(t, err, query)
	}
	values := url.Values{"after": {"0x0000000000000000"}, "generation": {"1"}, "review": {"conflicts"}, "limit": {"500"}}
	q, err = parseIdentityCatalogueQuery(values)
	require.NoError(t, err)
	require.True(t, q.HasAfter)
	require.True(t, q.HasGeneration)
	require.EqualValues(t, 500, q.Limit)
}

func TestIdentityCataloguePersistenceAndPagination(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	owner, logID := uuid.New(), uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: owner.String(), Email: owner.String() + "@example.com"})
	require.NoError(t, err)
	now := database.Timestamptz(time.Now())
	_, err = db.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: logID, Owner: owner, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now})
	require.NoError(t, err)
	q := identityCatalogueQuery{Review: "all", Limit: 2}
	empty, err := readIdentityCatalogue(ctx, db, logID, q, false)
	require.NoError(t, err)
	require.Nil(t, empty.Catalogue)
	require.NotNil(t, empty.Records)
	require.Empty(t, empty.Records)
	header := database.InsertLogIdentityCatalogueParams{LogGroupID: logID, Generation: 1, DatasetID: uuid.New(), CatalogueVersion: 1, RuleVersion: 1, GuidCount: 3}
	records := []database.InsertLogIdentityCatalogueRecordsParams{}
	for i := 0; i < 3; i++ {
		payload, err := json.Marshal(chroniclesdk.IdentityCatalogueRecord{GUID: guid.GUID(i), Unknown: i == 1, Conflict: i == 2})
		require.NoError(t, err)
		records = append(records, database.InsertLogIdentityCatalogueRecordsParams{LogGroupID: logID, Guid: guid.GUID(i), IsUnknown: i == 1, HasConflicts: i == 2, Payload: payload})
	}
	require.NoError(t, db.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.InsertLogIdentityCatalogue(ctx, header); err != nil {
			return err
		}
		return tx.InsertLogIdentityCatalogueRecords(ctx, records).Close()
	}, nil))
	page, err := readIdentityCatalogue(ctx, db, logID, q, false)
	require.NoError(t, err)
	require.Len(t, page.Records, 2)
	require.Equal(t, guid.GUID(0), page.Records[0].GUID)
	require.Equal(t, guid.GUID(1).String(), page.NextAfter)
	q.After = 1
	q.HasAfter = true
	q.Generation = header.Generation
	q.HasGeneration = true
	page, err = readIdentityCatalogue(ctx, db, logID, q, false)
	require.NoError(t, err)
	require.Len(t, page.Records, 1)
	require.Equal(t, guid.GUID(2), page.Records[0].GUID)
	require.Empty(t, page.NextAfter)
	for review, id := range map[string]guid.GUID{"unknown": 1, "conflicts": 2} {
		filtered, err := readIdentityCatalogue(ctx, db, logID, identityCatalogueQuery{Review: review, Limit: 100}, false)
		require.NoError(t, err)
		require.Len(t, filtered.Records, 1)
		require.Equal(t, id, filtered.Records[0].GUID)
	}
	download, err := readIdentityCatalogue(ctx, db, logID, q, true)
	require.NoError(t, err)
	require.Len(t, download.Records, 3)
	require.Empty(t, download.NextAfter)
	// Failed replacement rolls the header and cascading row deletion back together.
	rollback := errors.New("rollback")
	err = db.InTx(ctx, func(tx database.Store) error {
		if err := tx.DeleteLogIdentityCatalogue(ctx, logID); err != nil {
			return err
		}
		replacement := header
		replacement.Generation = 2
		if _, err := tx.InsertLogIdentityCatalogue(ctx, replacement); err != nil {
			return err
		}
		return rollback
	}, nil)
	require.ErrorIs(t, err, rollback)
	download, err = readIdentityCatalogue(ctx, db, logID, q, true)
	require.NoError(t, err)
	require.Len(t, download.Records, 3)
	require.Equal(t, header.Generation, download.Catalogue.Generation)
	require.NoError(t, db.InTx(ctx, func(tx database.Store) error {
		if err := tx.DeleteLogIdentityCatalogue(ctx, logID); err != nil {
			return err
		}
		header.Generation = 2
		_, err := tx.InsertLogIdentityCatalogue(ctx, header)
		return err
	}, nil))
	_, err = readIdentityCatalogue(ctx, db, logID, q, false)
	require.ErrorIs(t, err, errIdentityCatalogueReplaced)
	rows, err := db.DownloadLogIdentityCatalogueRecords(ctx, logID)
	require.NoError(t, err)
	require.Empty(t, rows)
	require.NoError(t, db.DeleteWoWLogGroup(ctx, logID))
	_, err = db.GetLogIdentityCatalogue(ctx, logID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestIdentityCatalogueAuthorization(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)
	owner, admin, logID := uuid.New(), uuid.New(), uuid.New()
	p := policy.New()
	p.GlobalChronicle().Moderate_logs(p.User(admin))
	// Intentionally no Chronicle relation on this log, so global administration
	// does not grant its view permission. The owner has view but not admin_logs.
	p.Raid_log(logID).Uploader(p.User(owner))
	_, err := zed.Write(ctx, *p.Txn())
	require.NoError(t, err)
	a := &API{Zed: zed} // nil DB proves denial happens before catalogue reads.
	r := chi.NewRouter()
	r.Route("/{logID}", func(r chi.Router) {
		r.Use(httpmw.LogIDMiddleware)
		r.Get("/", a.WoWLogIdentityCatalogue)
		r.Get("/download", a.WoWLogIdentityCatalogueDownload)
	})
	for _, actor := range []uuid.UUID{owner, admin, uuid.New()} {
		for _, suffix := range []string{"/", "/download"} {
			request := httptest.NewRequest(http.MethodGet, "/"+logID.String()+suffix, nil).WithContext(authz.AsUser(ctx, actor))
			response := httptest.NewRecorder()
			r.ServeHTTP(response, request)
			require.Equal(t, http.StatusForbidden, response.Code)
		}
	}
}

// The SDK cannot import the collector because registry -> armory -> db2sdk
// already imports chroniclesdk. Guard the duplicated wire contract explicitly.
func TestIdentityCatalogueWireParity(t *testing.T) {
	t.Parallel()
	var compare func(reflect.Type, reflect.Type)
	compare = func(a, b reflect.Type) {
		require.Equal(t, a.Kind(), b.Kind())
		switch a.Kind() {
		case reflect.Struct:
			if a == reflect.TypeOf(time.Time{}) {
				require.Equal(t, a, b)
				return
			}
			require.Equal(t, a.NumField(), b.NumField())
			for i := 0; i < a.NumField(); i++ {
				af, bf := a.Field(i), b.Field(i)
				require.Equal(t, af.Tag.Get("json"), bf.Tag.Get("json"))
				compare(af.Type, bf.Type)
			}
		case reflect.Slice, reflect.Pointer:
			compare(a.Elem(), b.Elem())
		default:
			require.Equal(t, a, b)
		}
	}
	compare(reflect.TypeOf(identitycatalog.Record{}), reflect.TypeOf(chroniclesdk.IdentityCatalogueRecord{}))
}
