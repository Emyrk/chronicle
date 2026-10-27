package api

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func luaTestTar(t *testing.T, entries ...struct {
	name    string
	content []byte
	kind    byte
	link    string
}) []byte {
	t.Helper()
	var b bytes.Buffer
	tw := tar.NewWriter(&b)
	for _, e := range entries {
		h := &tar.Header{Name: e.name, Mode: 0644, Typeflag: e.kind, Linkname: e.link, Size: int64(len(e.content))}
		if e.kind == tar.TypeSymlink || e.kind == tar.TypeLink {
			h.Size = 0
		}
		require.NoError(t, tw.WriteHeader(h))
		if h.Size > 0 {
			_, err := tw.Write(e.content)
			require.NoError(t, err)
		}
	}
	require.NoError(t, tw.Close())
	return b.Bytes()
}

func luaTestEntry(name string, content string) struct {
	name    string
	content []byte
	kind    byte
	link    string
} {
	return struct {
		name    string
		content []byte
		kind    byte
		link    string
	}{name: name, content: []byte(content), kind: tar.TypeReg}
}

const luaTestManifest = `{"manifest_version":1,"kind":"panel","name":"Example","slug":"example","entrypoint":"main.lua","capabilities":["ui"],"streams":[],"assets":[]}`

func TestCanonicalLuaZIP(t *testing.T) {
	t.Parallel()
	entries := []struct {
		name    string
		content []byte
		kind    byte
		link    string
	}{luaTestEntry("main.lua", "return {}"), luaTestEntry("project.json", luaTestManifest)}
	archive, err := canonicalLuaZIP(bytes.NewReader(luaTestTar(t, entries...)), "panel", "Example", "example")
	require.NoError(t, err)
	uncompressed, err := luaZIPFileBytes(archive)
	require.NoError(t, err)
	require.Equal(t, int64(len("return {}")+len(luaTestManifest)), uncompressed)
	_, err = luaZIPFileBytes([]byte("not a ZIP"))
	require.Error(t, err)
	require.Greater(t, len(archive), int(uncompressed)) // ZIP headers are not file bytes.
	z, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	require.NoError(t, err)
	require.Len(t, z.File, 2)
	require.Equal(t, "main.lua", z.File[0].Name)
	require.Equal(t, "project.json", z.File[1].Name)
	r, err := z.File[1].Open()
	require.NoError(t, err)
	raw, err := io.ReadAll(r)
	require.NoError(t, err)
	require.NoError(t, r.Close())
	require.JSONEq(t, luaTestManifest, string(raw))
	withDamage := strings.Replace(luaTestManifest, `"streams":[]`, `"streams":["damage"]`, 1)
	_, err = canonicalLuaZIP(bytes.NewReader(luaTestTar(t, luaTestEntry("main.lua", "return {}"), luaTestEntry("project.json", withDamage))), "panel", "Example", "example")
	require.NoError(t, err)
	wholeInstance := strings.Replace(withDamage, `"assets":[]`, `"stream_scope":"instance","max_events":2000000,"assets":[]`, 1)
	_, err = canonicalLuaZIP(bytes.NewReader(luaTestTar(t, luaTestEntry("main.lua", "return {}"), luaTestEntry("project.json", wholeInstance))), "panel", "Example", "example")
	require.NoError(t, err)
	// Tar header ordering, timestamps and modes never affect package identity.
	reversed := luaTestTar(t, entries[1], entries[0])
	same, err := canonicalLuaZIP(bytes.NewReader(reversed), "panel", "Example", "example")
	require.NoError(t, err)
	require.Equal(t, archive, same)
}

func TestCanonicalLuaZIPRejectsUnsafeEntries(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		entries []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}
	}{
		{"parent traversal", []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry("../escape.lua", "x")}},
		{"absolute", []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry("/escape.lua", "x")}},
		{"backslash", []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry(`foo\\escape.lua`, "x")}},
		{"symlink", []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{{name: "bad.lua", kind: tar.TypeSymlink, link: "main.lua"}}},
		{"hardlink", []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{{name: "bad.lua", kind: tar.TypeLink, link: "main.lua"}}},
		{"duplicate", []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry("main.lua", "x"), luaTestEntry("main.lua", "y")}},
		{"reserved", []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry("Chronicle.internal.lua", "x")}},
		{"svg", []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry("image.svg", "<svg/>")}},
		{"unknown extension", []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry("binary.exe", "x")}},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			all := append([]struct {
				name    string
				content []byte
				kind    byte
				link    string
			}{luaTestEntry("main.lua", "x"), luaTestEntry("project.json", luaTestManifest)}, tc.entries...)
			_, err := canonicalLuaZIP(bytes.NewReader(luaTestTar(t, all...)), "panel", "Example", "example")
			require.Error(t, err)
		})
	}
}

func TestValidRasterSignature(t *testing.T) {
	t.Parallel()
	require.True(t, validRasterSignature("image.png", append([]byte("\x89PNG\r\n\x1a\n"), 0)))
	require.True(t, validRasterSignature("image.jpeg", []byte{0xff, 0xd8, 0xff, 0xd9}))
	require.True(t, validRasterSignature("image.webp", []byte("RIFF0000WEBP")))
	require.False(t, validRasterSignature("image.png", []byte("<svg/>")))
	require.False(t, validRasterSignature("image.svg", []byte("<svg/>")))
}

func TestCanonicalLuaZIPRejectsOversizeAndManifest(t *testing.T) {
	t.Parallel()
	_, err := canonicalLuaZIP(strings.NewReader(strings.Repeat("x", maxLuaTarBytes+1)), "panel", "Example", "example")
	require.ErrorContains(t, err, "upload limit")
	for _, tc := range []struct {
		name     string
		manifest string
		extra    []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}
	}{
		{"wrong kind", strings.Replace(luaTestManifest, `"panel"`, `"guide"`, 1), nil},
		{"unsupported capability", strings.Replace(luaTestManifest, `"ui"`, `"network"`, 1), nil},
		{"stream", strings.Replace(luaTestManifest, `"streams":[]`, `"streams":["heal"]`, 1), nil},
		{"stream scope", strings.Replace(luaTestManifest, `"assets":[]`, `"stream_scope":"everything","assets":[]`, 1), nil},
		{"max events", strings.Replace(luaTestManifest, `"assets":[]`, `"max_events":0,"assets":[]`, 1), nil},
		{"fractional max events", strings.Replace(luaTestManifest, `"assets":[]`, `"max_events":1.5,"assets":[]`, 1), nil},
		{"missing asset", strings.Replace(luaTestManifest, `"assets":[]`, `"assets":["missing.png"]`, 1), nil},
		{"oversized asset", strings.Replace(luaTestManifest, `"assets":[]`, `"assets":["large.png"]`, 1), []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry("large.png", strings.Repeat("x", 2<<20+1))}},
		{"oversized Lua", luaTestManifest, []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry("helper.lua", strings.Repeat("x", 1<<20))}},
		{"spoofed raster", strings.Replace(luaTestManifest, `"assets":[]`, `"assets":["image.png"]`, 1), []struct {
			name    string
			content []byte
			kind    byte
			link    string
		}{luaTestEntry("image.png", `<svg xmlns="http://www.w3.org/2000/svg"/>`)}},
		{"unknown key", strings.Replace(luaTestManifest, `"assets":[]`, `"assets":[],"surprise":true`, 1), nil},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			entries := append([]struct {
				name    string
				content []byte
				kind    byte
				link    string
			}{luaTestEntry("main.lua", "x"), luaTestEntry("project.json", tc.manifest)}, tc.extra...)
			_, err := canonicalLuaZIP(bytes.NewReader(luaTestTar(t, entries...)), "panel", "Example", "example")
			require.Error(t, err)
		})
	}
}
