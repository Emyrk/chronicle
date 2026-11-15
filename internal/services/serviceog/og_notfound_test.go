package serviceog

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// notFoundStore answers every existence lookup with one configurable error.
type notFoundStore struct {
	database.Store
	// err is returned by the guild, realm, character and public instance lookups.
	err error
	// unlistedErr is returned by the lookups that include unlisted logs.
	unlistedErr error
	player      database.GetGamePlayerByGUIDRow
	realm       database.WowServerRealm
}

func (s *notFoundStore) GetGuildByID(context.Context, uuid.UUID) (database.GetGuildByIDRow, error) {
	return database.GetGuildByIDRow{}, s.err
}

func (s *notFoundStore) PublicInstance(context.Context, uuid.UUID) (database.LogInstancesGuild, error) {
	return database.LogInstancesGuild{}, s.err
}

func (s *notFoundStore) PublicInstanceBySlug(context.Context, pgtype.Text) (database.LogInstancesGuild, error) {
	return database.LogInstancesGuild{}, s.err
}

func (s *notFoundStore) InstanceWithUnlisted(context.Context, uuid.UUID) (database.InstanceWithUnlistedRow, error) {
	return database.InstanceWithUnlistedRow{}, s.unlistedErr
}

func (s *notFoundStore) InstanceBySlugWithUnlisted(context.Context, pgtype.Text) (database.InstanceBySlugWithUnlistedRow, error) {
	return database.InstanceBySlugWithUnlistedRow{}, s.unlistedErr
}

func (s *notFoundStore) GetWoWServerRealmByName(context.Context, string) (database.WowServerRealm, error) {
	return s.realm, s.err
}

func (s *notFoundStore) GetGamePlayerByGUID(context.Context, database.GetGamePlayerByGUIDParams) (database.GetGamePlayerByGUIDRow, error) {
	return s.player, s.err
}

func newNotFoundService(t *testing.T, store *notFoundStore) *Service {
	t.Helper()
	return New(Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), store)})
}

func ogRequest(t *testing.T, target string) *http.Request {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, target, nil)
	r.Host = "forever.chronicleclassic.com"
	return r.WithContext(testutil.Context(t, testutil.WaitShort))
}

func requireNotFound(t *testing.T, og *frontend.OGData) {
	t.Helper()
	require.NotNil(t, og)
	require.True(t, og.NotFound)
}

func requireNotMarkedNotFound(t *testing.T, og *frontend.OGData) {
	t.Helper()
	if og != nil {
		require.False(t, og.NotFound)
	}
}

func TestGuildOGNotFound(t *testing.T) {
	t.Parallel()

	t.Run("not a uuid", func(t *testing.T) {
		t.Parallel()
		s := newNotFoundService(t, &notFoundStore{})
		requireNotFound(t, s.guildOG(ogRequest(t, "/g/nope"), "nope"))
	})
	t.Run("unknown guild", func(t *testing.T) {
		t.Parallel()
		s := newNotFoundService(t, &notFoundStore{err: pgx.ErrNoRows})
		id := uuid.NewString()
		requireNotFound(t, s.guildOG(ogRequest(t, "/g/"+id), id))
	})
	t.Run("lookup failure is not a 404", func(t *testing.T) {
		t.Parallel()
		s := newNotFoundService(t, &notFoundStore{err: context.DeadlineExceeded})
		id := uuid.NewString()
		requireNotMarkedNotFound(t, s.guildOG(ogRequest(t, "/g/"+id), id))
	})
}

func TestInstanceOGNotFound(t *testing.T) {
	t.Parallel()

	id := uuid.NewString()
	for name, idOrSlug := range map[string]string{"uuid": id, "slug": "abcdef123456"} {
		t.Run(name+"/missing", func(t *testing.T) {
			t.Parallel()
			s := newNotFoundService(t, &notFoundStore{err: pgx.ErrNoRows, unlistedErr: pgx.ErrNoRows})
			requireNotFound(t, s.instanceOG(ogRequest(t, "/instances/"+idOrSlug), "forever.chronicleclassic.com", idOrSlug))
		})
		t.Run(name+"/unlisted logs exist", func(t *testing.T) {
			t.Parallel()
			// The public lookup misses unlisted logs, but they are real pages.
			s := newNotFoundService(t, &notFoundStore{err: pgx.ErrNoRows})
			requireNotMarkedNotFound(t, s.instanceOG(ogRequest(t, "/instances/"+idOrSlug), "forever.chronicleclassic.com", idOrSlug))
		})
		t.Run(name+"/lookup failure is not a 404", func(t *testing.T) {
			t.Parallel()
			s := newNotFoundService(t, &notFoundStore{err: context.DeadlineExceeded})
			requireNotMarkedNotFound(t, s.instanceOG(ogRequest(t, "/instances/"+idOrSlug), "forever.chronicleclassic.com", idOrSlug))
		})
		t.Run(name+"/unlisted check failing is not a 404", func(t *testing.T) {
			t.Parallel()
			s := newNotFoundService(t, &notFoundStore{err: pgx.ErrNoRows, unlistedErr: errors.New("boom")})
			requireNotMarkedNotFound(t, s.instanceOG(ogRequest(t, "/instances/"+idOrSlug), "forever.chronicleclassic.com", idOrSlug))
		})
	}
}

func TestArmoryOGNotFound(t *testing.T) {
	t.Parallel()

	guid := "0x0000000000000051"

	t.Run("unknown realm", func(t *testing.T) {
		t.Parallel()
		s := newNotFoundService(t, &notFoundStore{err: pgx.ErrNoRows})
		requireNotFound(t, s.armoryOG(ogRequest(t, "/armory/Nowhere/"+guid), "Nowhere", guid))
	})
	t.Run("unknown character in a known realm", func(t *testing.T) {
		t.Parallel()
		s := newNotFoundService(t, &notFoundStore{err: pgx.ErrNoRows})
		realm := uuid.NewString()
		requireNotFound(t, s.armoryOG(ogRequest(t, "/armory/"+realm+"/"+guid), realm, guid))
	})
	t.Run("lookup failure is not a 404", func(t *testing.T) {
		t.Parallel()
		s := newNotFoundService(t, &notFoundStore{err: context.DeadlineExceeded})
		realm := uuid.NewString()
		requireNotMarkedNotFound(t, s.armoryOG(ogRequest(t, "/armory/"+realm+"/"+guid), realm, guid))
	})
}

// A realm name with a space must reach the canonical URL percent-encoded,
// whether the router handed it over decoded or encoded.
func TestArmoryOGCanonicalIsEncoded(t *testing.T) {
	t.Parallel()

	player := characterCardFixture()
	for name, segment := range map[string]string{"decoded": "Kronos III", "encoded": "Kronos%20III"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := newNotFoundService(t, &notFoundStore{player: player, realm: database.WowServerRealm{ID: uuid.New(), Name: "Kronos III"}})
			og := s.armoryOG(ogRequest(t, "/armory/Kronos%20III/0x0000000000000051"), segment, "0x0000000000000051")
			require.NotNil(t, og)
			require.False(t, og.NotFound)
			require.Equal(t, "https://forever.chronicleclassic.com/armory/Kronos%20III/"+player.ID.String(), og.URL)
			parsed, err := url.Parse(og.URL)
			require.NoError(t, err)
			require.NotContains(t, parsed.String(), " ")
		})
	}
}

// Canonical page URLs use one host per tenant, whatever Host the request used.
func TestCanonicalHostPerTenant(t *testing.T) {
	t.Parallel()

	tenant := database.Tenant{ID: uuid.New(), Slug: pgtype.Text{String: "forever", Valid: true}}
	tenants := servicetenant.NewTestWithTenants(url.URL{Scheme: "https", Host: "chronicleclassic.com"}, "chronicleclassic.com", tenant)
	build := func(host string, withTenant bool) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/g/"+uuid.NewString(), nil)
		r.Host = host
		ctx := context.Background()
		if withTenant {
			ctx = servicetenant.WithTenant(ctx, tenant)
		}
		return r.WithContext(ctx)
	}
	s := New(Options{Tenant: tenants})

	// The tenant's own host is kept; another host the request arrived on
	// (platform domain, alias) collapses onto it.
	require.Equal(t, "https://forever.chronicleclassic.com/g/x", canonicalRequestURL(s, withPath(build("forever.chronicleclassic.com", true), "/g/x")))
	require.Equal(t, "https://forever.chronicleclassic.com/g/x", canonicalRequestURL(s, withPath(build("chronicle-production.up.railway.app", true), "/g/x")))
	require.Equal(t, "https://forever.chronicleclassic.com/g/x", canonicalRequestURL(s, withPath(build("alias.example.org", true), "/g/x")))

	// Without any configured host the request host is kept, as before.
	require.Equal(t, "https://anything.test/g/x", canonicalRequestURL(New(Options{}), withPath(build("anything.test", false), "/g/x")))
}

func withPath(r *http.Request, path string) *http.Request {
	r.URL.Path = path
	return r
}

func TestLeaderboardInstanceNamesFromRegistry(t *testing.T) {
	t.Parallel()

	names := knownLeaderboardInstances()
	// Names from every flavor, whichever dataset the site uses, plus derived names
	// that only exist for some flavors and a wing VanillaPlus removes.
	for _, want := range []string{
		"Molten Core", "Molten-Core", "molten%20core", "Naxxramas", "Ulduar", "Serpentshrine Cavern",
		"Emerald Sanctum", "Upper-Tower-of-Karazhan", "Lower Tower of Karazhan", "Scarlet Monastery Library",
	} {
		_, ok := names[normalizeLeaderboardInstance(want)]
		require.True(t, ok, want)
	}
	_, ok := names[normalizeLeaderboardInstance("not-a-raid")]
	require.False(t, ok)
}

// ogRouter serves every OG route the way the frontend handler does, over a store
// where every lookup misses, so any parameterized route with an unknown subject
// would report NotFound.
func ogRouter(t *testing.T) func(path string) *frontend.OGData {
	t.Helper()
	s := newNotFoundService(t, &notFoundStore{err: pgx.ErrNoRows, unlistedErr: pgx.ErrNoRows})
	r := chi.NewRouter()
	var got *frontend.OGData
	var matched bool
	for _, route := range s.Routes() {
		resolve := route.Resolve
		r.Get(route.Pattern, func(_ http.ResponseWriter, req *http.Request) { matched, got = true, resolve(req) })
	}
	// The result is nil when a route matches but has no metadata of its own.
	return func(path string) *frontend.OGData {
		got, matched = nil, false
		req := httptest.NewRequest(http.MethodGet, "https://capy.chronicleclassic.com"+path, nil)
		r.ServeHTTP(httptest.NewRecorder(), req.WithContext(testutil.Context(t, testutil.WaitShort)))
		require.True(t, matched, "no OG route matched %s", path)
		return got
	}
}

func ogNotFound(og *frontend.OGData) bool { return og != nil && og.NotFound }

func TestLeaderboardOGNotFound(t *testing.T) {
	t.Parallel()

	serve := ogRouter(t)
	for _, path := range []string{
		"/leaderboards",
		"/leaderboards/statistics",
		"/leaderboards/Molten-Core",
		"/leaderboards/molten%20core",
		"/leaderboards/Molten-Core/ratings",
		"/leaderboards/Molten-Core/overview",
		// Raids of other flavors than any one site's: the root host lists them all.
		"/leaderboards/Ulduar",
		"/leaderboards/Emerald-Sanctum/speedruns",
		// A client-side redirect stub, not a raid.
		"/leaderboards/configuration",
		"/leaderboards/career",
	} {
		require.False(t, ogNotFound(serve(path)), path)
	}
	for _, path := range []string{
		"/leaderboards/not-a-raid",
		"/leaderboards/free%20text%20spam",
		"/leaderboards/not-a-raid/ratings",
		"/leaderboards/Molten-Core/not-a-tab",
	} {
		require.True(t, ogNotFound(serve(path)), path)
	}
}

// Fixed SPA routes that share a path shape with an unknown-subject route must not
// be swallowed by it: chi prefers the static route.
func TestStaticInstanceRoutesAreNotNotFound(t *testing.T) {
	t.Parallel()

	serve := ogRouter(t)
	for path, title := range map[string]string{
		"/instances/leeroy":  "Leeroy Jenkins: The Rookery",
		"/instances/compare": "Compare Clear Times",
	} {
		t.Run(path, func(t *testing.T) {
			og := serve(path)
			require.NotNil(t, og)
			require.False(t, og.NotFound)
			require.Equal(t, title, og.Title)
			require.Equal(t, "https://capy.chronicleclassic.com"+path, og.URL)
		})
	}
	// A real unknown ID under the same prefix still 404s.
	require.True(t, ogNotFound(serve("/instances/"+uuid.NewString())))
}

// Every fixed (parameter-free) route the SPA declares must stay out of the 404
// logic, whichever parameterized OG route it shares a shape with.
func TestSPAStaticRoutesAreNotNotFound(t *testing.T) {
	t.Parallel()

	source, err := os.ReadFile("../../../frontend/chronicle/src/App.tsx")
	require.NoError(t, err)
	paths := regexp.MustCompile(`<Route path="(/[^":*]*)"`).FindAllSubmatch(source, -1)
	require.Greater(t, len(paths), 50, "App.tsx route scan found too few routes")

	serve := ogRouter(t)
	checked := 0
	for _, match := range paths {
		path := string(match[1])
		for _, prefix := range []string{"/instances/", "/g/", "/armory/", "/leaderboards/"} {
			if strings.HasPrefix(path, prefix) {
				checked++
				require.False(t, ogNotFound(serve(path)), "%s is a real SPA route", path)
			}
		}
	}
	require.GreaterOrEqual(t, checked, 4, "expected /instances/leeroy, /instances/compare, /leaderboards/career and /leaderboards/configuration")
}
