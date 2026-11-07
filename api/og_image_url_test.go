package api

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
)

// Pinned to match services/og/tests/fixtures/og-sig-vectors.json (#1661).
var ogSigVectors = []struct {
	key    string
	params map[string]string
	sig    string
}{
	{
		key:    "test-og-signing-key",
		params: map[string]string{"template": "talents", "class": "mage", "spec": "Fire", "points": "17-34-0", "host": "forever.chronicleclassic.com", "product": "WoW Forever", "v": "1"},
		sig:    "f43227d0557bd10628c0808c28881500",
	},
	{
		key:    "test-og-signing-key",
		params: map[string]string{"template": "raid", "guild": "<Nightfall> & Co", "raid": "Ahn'Qiraj", "top": "Thalendris:mage:1284,Grimtusk:warrior:1201", "host": "chronicleclassic.com", "v": "2"},
		sig:    "ec4a6217febcb090c103b5b2588b704f",
	},
}

func TestOGSignatureVectors(t *testing.T) {
	t.Parallel()

	for _, vec := range ogSigVectors {
		params := url.Values{}
		for k, v := range vec.params {
			params.Set(k, v)
		}
		require.Equal(t, vec.sig, ogSignature(vec.key, params))

		// An existing sig param is not part of the canonical string.
		params.Set("sig", "ignored")
		require.Equal(t, vec.sig, ogSignature(vec.key, params))
	}
}

func TestSignedOGImageURLMatchesVectors(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	for _, vec := range ogSigVectors {
		params := url.Values{}
		for k, v := range vec.params {
			if k != "template" && k != "host" && k != "product" {
				params.Set(k, v)
			}
		}
		raw := signedOGImageURL(base, vec.key, vec.params["template"], vec.params["host"], vec.params["product"], params)

		u, err := url.Parse(raw)
		require.NoError(t, err)
		require.Equal(t, "og.example.com", u.Host)
		require.Equal(t, "/api/og", u.Path)
		got := u.Query()
		require.Equal(t, vec.sig, got.Get("sig"))
		require.Len(t, got, len(vec.params)+1)
		for k, v := range vec.params {
			require.Equal(t, v, got.Get(k), k)
		}
	}
}

func testOGImageAPI(t *testing.T, serviceURL string) *API {
	t.Helper()
	api := &API{Opts: &Options{OGSigningKey: "test-og-signing-key"}}
	if serviceURL != "" {
		u, err := url.Parse(serviceURL)
		require.NoError(t, err)
		api.Opts.OGServiceURL = u
	}
	return api
}

func TestOGImageURL(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "https://capy.chronicleclassic.com/talents/mage", nil)

	t.Run("Unset", func(t *testing.T) {
		t.Parallel()
		require.Empty(t, testOGImageAPI(t, "").ogImageURL(req, "talents", url.Values{"class": {"mage"}}))

		api := testOGImageAPI(t, "https://og.example.com")
		api.Opts.OGSigningKey = ""
		require.Empty(t, api.ogImageURL(req, "talents", url.Values{"class": {"mage"}}))
	})

	t.Run("RequestHost", func(t *testing.T) {
		t.Parallel()
		params := url.Values{"class": {"mage"}, "points": {"17-34-0"}}
		api := testOGImageAPI(t, "https://og.example.com")
		raw := api.ogImageURL(req, "talents", params)

		u, err := url.Parse(raw)
		require.NoError(t, err)
		require.Equal(t, "https://og.example.com/api/og", u.Scheme+"://"+u.Host+u.Path)
		q := u.Query()
		require.Equal(t, "talents", q.Get("template"))
		require.Equal(t, "mage", q.Get("class"))
		require.Equal(t, "17-34-0", q.Get("points"))
		require.Equal(t, "capy.chronicleclassic.com", q.Get("host"))
		require.Equal(t, ogImageVersion, q.Get("v"))
		require.Equal(t, seoProductName(api.resolvedSiteFlavor(req.Context())), q.Get("product"))
		require.Equal(t, ogSignature("test-og-signing-key", q), q.Get("sig"))
		require.Len(t, params, 2, "caller params must not be modified")
	})

	t.Run("TenantHostAndVersion", func(t *testing.T) {
		t.Parallel()
		params := url.Values{"host": {"forever.chronicleclassic.com"}, "v": {"7"}}
		raw := testOGImageAPI(t, "https://og.example.com/").ogImageURL(req, "raid", params)

		u, err := url.Parse(raw)
		require.NoError(t, err)
		require.Equal(t, "/api/og", u.Path)
		q := u.Query()
		require.Equal(t, "forever.chronicleclassic.com", q.Get("host"))
		require.Equal(t, "7", q.Get("v"))
		require.Equal(t, ogSignature("test-og-signing-key", q), q.Get("sig"))
	})
}
