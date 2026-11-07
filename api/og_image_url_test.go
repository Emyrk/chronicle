package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

type ogSigVector struct {
	Key    string            `json:"key"`
	Params map[string]string `json:"params"`
	Sig    string            `json:"sig"`
}

// loadOGSigVectors reads the signing vectors shared with the OG service's verifier.
func loadOGSigVectors(t *testing.T) []ogSigVector {
	t.Helper()
	data, err := os.ReadFile("../services/og/tests/fixtures/og-sig-vectors.json")
	require.NoError(t, err)
	var vectors []ogSigVector
	require.NoError(t, json.Unmarshal(data, &vectors))
	require.NotEmpty(t, vectors)
	return vectors
}

func TestOGSignatureVectors(t *testing.T) {
	t.Parallel()

	for _, vec := range loadOGSigVectors(t) {
		params := url.Values{}
		for k, v := range vec.Params {
			params.Set(k, v)
		}
		require.Equal(t, vec.Sig, ogSignature(vec.Key, params))

		// An existing sig param is not part of the canonical string.
		params.Set("sig", "ignored")
		require.Equal(t, vec.Sig, ogSignature(vec.Key, params))
	}
}

func TestSignedOGImageURLMatchesVectors(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	for _, vec := range loadOGSigVectors(t) {
		params := url.Values{}
		for k, v := range vec.Params {
			if k != "template" && k != "host" && k != "product" {
				params.Set(k, v)
			}
		}
		raw := signedOGImageURL(base, vec.Key, vec.Params["template"], vec.Params["host"], vec.Params["product"], params)

		u, err := url.Parse(raw)
		require.NoError(t, err)
		require.Equal(t, "og.example.com", u.Host)
		require.Equal(t, "/api/og", u.Path)
		got := u.Query()
		require.Equal(t, vec.Sig, got.Get("sig"))
		require.Len(t, got, len(vec.Params)+1)
		for k, v := range vec.Params {
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

func TestSignedOGImageURLSanitizesValues(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://og.example.com")
	require.NoError(t, err)
	params := url.Values{
		"bad":   {"abc\xff\xfe"},
		"guild": {"Night\nv\n9\r\nfall"},
	}
	raw := signedOGImageURL(base, "test-og-signing-key", "raid", "chronicle\xffclassic.com", "Wo\nW", params)

	// Parse the way the service does: decode the query, then verify the sig
	// over exactly what was decoded.
	u, err := url.Parse(raw)
	require.NoError(t, err)
	q := u.Query()
	require.Equal(t, "abc\uFFFD", q.Get("bad"))
	require.Equal(t, "Night v 9  fall", q.Get("guild"))
	require.Equal(t, "chronicle\uFFFDclassic.com", q.Get("host"))
	require.Equal(t, "Wo W", q.Get("product"))
	require.Equal(t, ogSignature("test-og-signing-key", q), q.Get("sig"))
	require.Equal(t, "abc\xff\xfe", params.Get("bad"), "caller params must not be modified")
}
