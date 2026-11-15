package serviceog

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
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

	reg := registry.RegistryForFlavor(nil, database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorTurtle})
	names := leaderboardInstanceNames(reg.AllInstanceDetails())
	for _, want := range []string{"Molten Core", "Molten-Core", "molten%20core"} {
		_, ok := names[normalizeLeaderboardInstance(want)]
		require.True(t, ok, want)
	}
	// Turtle's Lower/Upper Karazhan only exist as derived names.
	_, ok := names[normalizeLeaderboardInstance("Upper-Tower-of-Karazhan")]
	require.True(t, ok)
	_, ok = names[normalizeLeaderboardInstance("not-a-raid")]
	require.False(t, ok)
}

func TestLeaderboardOGNotFound(t *testing.T) {
	t.Parallel()

	s := New(Options{})
	// Stand in for a registry-backed service: seed the per-flavor set.
	flavor := s.resolvedSiteFlavor(context.Background())
	s.leaderboardNames.Store(flavor.CanonicalKey(), map[string]struct{}{normalizeLeaderboardInstance("Molten Core"): {}})

	r := chi.NewRouter()
	var got *frontend.OGData
	for _, route := range s.Routes() {
		resolve := route.Resolve
		r.Get(route.Pattern, func(_ http.ResponseWriter, req *http.Request) { got = resolve(req) })
	}
	serve := func(path string) *frontend.OGData {
		got = nil
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "https://capy.chronicleclassic.com"+path, nil))
		require.NotNil(t, got, path)
		return got
	}

	for _, path := range []string{
		"/leaderboards",
		"/leaderboards/statistics",
		"/leaderboards/Molten-Core",
		"/leaderboards/molten%20core",
		"/leaderboards/Molten-Core/ratings",
		"/leaderboards/Molten-Core/overview",
	} {
		require.False(t, serve(path).NotFound, path)
	}
	for _, path := range []string{
		"/leaderboards/not-a-raid",
		"/leaderboards/free%20text%20spam",
		"/leaderboards/not-a-raid/ratings",
		"/leaderboards/Molten-Core/not-a-tab",
	} {
		require.True(t, serve(path).NotFound, path)
	}

	t.Run("without a registry nothing 404s", func(t *testing.T) {
		t.Parallel()
		require.False(t, New(Options{}).leaderboardNotFound(flavor, "not-a-raid", "", ""))
	})
}
