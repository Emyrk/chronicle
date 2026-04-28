package api

import (
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCleanDomain(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input string
		want  string
	}{
		{"chrn.link", "chrn.link"},
		{"https://chrn.link", "chrn.link"},
		{"http://chrn.link", "chrn.link"},
		{"https://https://chrn.link", "https://chrn.link"},
	}
	for _, tc := range tests {
		require.Equal(t, tc.want, cleanDomain(tc.input), "cleanDomain(%q)", tc.input)
	}
}

func TestShareURL(t *testing.T) {
	t.Parallel()

	r, _ := http.NewRequest(http.MethodGet, "https://chronicle.example.com/", nil)

	tests := []struct {
		name   string
		domain string
		code   string
		want   string
	}{
		{"bare domain", "chrn.link", "abc123", "https://chrn.link/abc123"},
		{"domain with https", "https://chrn.link", "abc123", "https://chrn.link/abc123"},
		{"empty domain falls back", "", "abc123", "http://chronicle.example.com/s/abc123"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			a := &API{Opts: &Options{ShortLinkDomain: tc.domain, AccessURL: mustParseURL("https://chronicle.example.com")}}
			require.Equal(t, tc.want, a.ShareURL(r, tc.code))
		})
	}
}

func TestLayoutShareURL(t *testing.T) {
	t.Parallel()

	r, _ := http.NewRequest(http.MethodGet, "https://chronicle.example.com/", nil)

	tests := []struct {
		name   string
		domain string
		code   string
		want   string
	}{
		{"bare domain", "chrn.link", "xyz", "https://chrn.link/l/xyz"},
		{"domain with https", "https://chrn.link", "xyz", "https://chrn.link/l/xyz"},
		{"empty domain falls back", "", "xyz", "http://chronicle.example.com/account/layout-lab?shared_code=xyz"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			a := &API{Opts: &Options{ShortLinkDomain: tc.domain, AccessURL: mustParseURL("https://chronicle.example.com")}}
			require.Equal(t, tc.want, a.LayoutShareURL(r, tc.code))
		})
	}
}

func mustParseURL(s string) *url.URL {
	u, err := url.Parse(s)
	if err != nil {
		panic(err)
	}
	return u
}
