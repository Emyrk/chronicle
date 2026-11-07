package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"sort"
	"strings"
)

// ogImageVersion is the default `v` param on OG service image URLs. Bump it to
// make crawlers and the CDN fetch fresh renders for every card.
const ogImageVersion = "1"

// ogImageURL returns a signed OG service image URL for template, or "" when the
// OG service URL or signing key is not configured (callers then keep their
// existing image). params may carry an explicit "host" (e.g. a tenant host that
// differs from the request host) and "v"; otherwise they default to ogHost(r)
// and ogImageVersion. "product" is the site flavor's product name, omitted when
// empty. params is not modified.
func (api *API) ogImageURL(r *http.Request, template string, params url.Values) string {
	if api.Opts == nil || api.Opts.OGServiceURL == nil || api.Opts.OGSigningKey == "" {
		return ""
	}
	host := params.Get("host")
	if host == "" {
		host = ogHost(r)
	}
	product := seoProductName(api.resolvedSiteFlavor(r.Context()))
	return signedOGImageURL(api.Opts.OGServiceURL, api.Opts.OGSigningKey, template, host, product, params)
}

func signedOGImageURL(base *url.URL, key, template, host, product string, params url.Values) string {
	q := url.Values{}
	for k, v := range params {
		if len(v) > 0 {
			q.Set(k, v[0])
		}
	}
	q.Set("template", template)
	q.Set("host", host)
	if product != "" {
		q.Set("product", product)
	}
	if q.Get("v") == "" {
		q.Set("v", ogImageVersion)
	}
	q.Set("sig", ogSignature(key, q))

	u := base.JoinPath("api", "og")
	u.RawQuery = q.Encode()
	return u.String()
}

// ogSignature signs params the way the OG service verifies them: every key
// except "sig", sorted ascending, first value only, as key\nvalue\n; the
// signature is the first 32 lowercase hex chars of HMAC-SHA256.
func ogSignature(key string, params url.Values) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if k != "sig" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)

	var canonical strings.Builder
	for _, k := range keys {
		canonical.WriteString(k)
		canonical.WriteString("\n")
		canonical.WriteString(params.Get(k))
		canonical.WriteString("\n")
	}
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(canonical.String()))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}
