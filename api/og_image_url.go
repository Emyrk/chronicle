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
// and ogImageVersion. "product" is the site flavor's product name; a caller's
// "product" is kept only when that name is empty. Every value goes through
// sanitizeOGParam before signing. params is not modified.
func (api *API) ogImageURL(r *http.Request, template string, params url.Values) string {
	if !api.ogServiceConfigured() {
		return ""
	}
	return api.ogImageURLForProduct(r, template, seoProductName(api.resolvedSiteFlavor(r.Context())), params)
}

// ogImageURLForProduct is ogImageURL with the product name already resolved.
func (api *API) ogImageURLForProduct(r *http.Request, template, product string, params url.Values) string {
	if api.Opts == nil || api.Opts.OGServiceURL == nil || api.Opts.OGSigningKey == "" {
		return ""
	}
	host := params.Get("host")
	if host == "" {
		host = ogHost(r)
	}
	return signedOGImageURL(api.Opts.OGServiceURL, api.Opts.OGSigningKey, template, host, product, params)
}

// ogServiceConfigured reports whether ogImageURL can sign URLs, so callers
// can skip loading card data when it can't.
func (api *API) ogServiceConfigured() bool {
	return api.Opts != nil && api.Opts.OGServiceURL != nil && api.Opts.OGSigningKey != ""
}

func signedOGImageURL(base *url.URL, key, template, host, product string, params url.Values) string {
	q := url.Values{}
	set := func(k, v string) { q.Set(k, sanitizeOGParam(v)) }
	for k, v := range params {
		if len(v) > 0 {
			set(k, v[0])
		}
	}
	set("template", template)
	set("host", host)
	if product != "" {
		set("product", product)
	}
	if q.Get("v") == "" {
		set("v", ogImageVersion)
	}
	q.Set("sig", ogSignature(key, q))

	u := base.JoinPath("api", "og")
	u.RawQuery = q.Encode()
	return u.String()
}

// sanitizeOGParam makes a value sign the same on both sides. Invalid UTF-8
// becomes U+FFFD before the value is encoded, so the service decodes exactly
// the string that was signed (URLSearchParams would otherwise decode raw bytes
// to U+FFFD after Go had signed them). CR/LF become spaces so a value cannot
// mimic extra key\nvalue\n lines in the canonical string.
func sanitizeOGParam(v string) string {
	return ogParamNewlines.Replace(strings.ToValidUTF8(v, "\uFFFD"))
}

var ogParamNewlines = strings.NewReplacer("\r", " ", "\n", " ")

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
