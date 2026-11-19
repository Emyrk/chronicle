package events

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/internal/luadata"
	"github.com/stretchr/testify/require"
)

func encodeArtifact(t *testing.T, sources ...map[string]any) []byte {
	t.Helper()
	if sources == nil {
		sources = []map[string]any{}
	}
	data, err := json.Marshal(map[string]any{"schema_version": 1, "kind": "sidekick-events", "sources": sources})
	require.NoError(t, err)
	return data
}

func source(lua string) map[string]any {
	return map[string]any{"account": "EXAMPLE", "source": "WTF/Account/EXAMPLE/SavedVariables/ChronicleCompanionForever.lua", "collections_lua": lua}
}

func TestDecodeSanitizedFixture(t *testing.T) {
	t.Parallel()
	data, err := os.ReadFile("testdata/sidekick-events-v1.json")
	require.NoError(t, err)
	require.Contains(t, string(data), `\r\n`)
	artifact, err := Decode(t.Context(), bytes.NewReader(data))
	require.NoError(t, err)
	require.Equal(t, 1, artifact.SchemaVersion)
	require.Equal(t, "sidekick-events", artifact.Kind)
	require.Len(t, artifact.Sources, 1)
	snapshot := artifact.Sources[0]
	require.Equal(t, "EXAMPLE_ACCOUNT", snapshot.Account)
	require.Equal(t, "WTF/Account/EXAMPLE_ACCOUNT/SavedVariables/ChronicleCompanionForever.lua", snapshot.Path)
	players := snapshot.Collections.Fields["scouting"].Fields["Players"].Fields
	require.Len(t, players, 2)
	player := players["Player-0000-00000001"]
	require.Equal(t, "Example-Character", player.Fields["Name"].Text)
	require.Equal(t, "1700000100", player.Fields["LastSeen"].Text)
	// Observations stay aligned and ordered. No delta expansion, timestamp
	// deduplication, or enrichment is performed at the literal decoding boundary.
	require.Equal(t, []luadata.Value{
		{Kind: luadata.Number, Text: "1700000000"},
		{Kind: luadata.Number, Text: "1700000000"},
		{Kind: luadata.Number, Text: "1700000060"},
	}, player.Fields["At"].Array)
	require.Equal(t, []luadata.Value{
		{Kind: luadata.Number, Text: "17"}, {Kind: luadata.String, Text: "_"}, {Kind: luadata.Bool},
	}, player.Fields["Levels"].Array)
	require.Equal(t, []luadata.Value{
		{Kind: luadata.Bool}, {Kind: luadata.String}, {Kind: luadata.String, Text: "Example Guild"},
	}, player.Fields["Guilds"].Array)
	require.Equal(t, []luadata.Value{
		{Kind: luadata.Bool, Boolean: true}, {Kind: luadata.String, Text: "_"}, {Kind: luadata.Bool},
	}, player.Fields["Party"].Array)
	require.Equal(t, "玩家-Example", players["Player-0000-00000002"].Fields["Name"].Text)
	require.Equal(t, `Quoted "Guild"`, players["Player-0000-00000002"].Fields["Guilds"].Array[0].Text)
	require.Equal(t, luadata.Table, snapshot.Collections.Fields["future_collection"].Kind)
}

func TestDecodeSourcesStayIndependent(t *testing.T) {
	t.Parallel()
	// Reusing the same GUID is intentional: accounts are snapshots, not merge keys.
	first := source(`{scouting = {Players = {["Player-example"] = {Levels = {10}}}}}`)
	second := source(`{scouting = {Players = {["Player-example"] = {Levels = {20}}}}}`)
	first["account"], second["account"] = "Z_ACCOUNT", "A_ACCOUNT"
	data := encodeArtifact(t, first, second)
	artifact, err := Decode(t.Context(), bytes.NewReader(data))
	require.NoError(t, err)
	require.Len(t, artifact.Sources, 2)
	require.Equal(t, "Z_ACCOUNT", artifact.Sources[0].Account)
	require.Equal(t, "A_ACCOUNT", artifact.Sources[1].Account)
	for i, level := range []string{"10", "20"} {
		got := artifact.Sources[i].Collections.Fields["scouting"].Fields["Players"].Fields["Player-example"].Fields["Levels"].Array[0].Text
		require.Equal(t, level, got)
	}
}

func TestDecodeTransportEscapes(t *testing.T) {
	t.Parallel()
	// JSON escaping is removed exactly once. The remaining Lua escapes are then
	// interpreted by the restricted data reader, not by manual JSON unescaping.
	lua := "{\r\n name = \"玩家 \\\"quoted\\\"\", path = \"C:\\\\Logs\", line = \"one\\ntwo\", literal = \"\\\\n\"\r\n}"
	artifact, err := Decode(t.Context(), bytes.NewReader(encodeArtifact(t, source(lua))))
	require.NoError(t, err)
	fields := artifact.Sources[0].Collections.Fields
	require.Equal(t, `玩家 "quoted"`, fields["name"].Text)
	require.Equal(t, `C:\Logs`, fields["path"].Text)
	require.Equal(t, "one\ntwo", fields["line"].Text)
	require.Equal(t, `\n`, fields["literal"].Text)
}

func TestDecodeUnknownCollectionsAreOnlyData(t *testing.T) {
	t.Parallel()
	artifact, err := Decode(t.Context(), bytes.NewReader(encodeArtifact(t, source(`{future = {command = "os.execute('never')", flag = false}}`))))
	require.NoError(t, err)
	require.Equal(t, "os.execute('never')", artifact.Sources[0].Collections.Fields["future"].Fields["command"].Text)
	// Unknown collection values must still be literal data, not executable Lua.
	_, err = Decode(t.Context(), bytes.NewReader(encodeArtifact(t, source(`{future = os.execute("never")}`))))
	require.ErrorContains(t, err, "source 0: parse collections_lua")
}

func TestDecodeRejectsInvalidEnvelope(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ name, input, want string }{
		{"malformed", `{`, "JSON"},
		{"trailing JSON", `{} {}`, "JSON"},
		{"array", `[]`, "JSON"},
		{"null", `null`, "schema_version"},
		{"version", `{"schema_version":2,"kind":"sidekick-events","sources":[]}`, "schema_version 2"},
		{"kind", `{"schema_version":1,"kind":"forever-events","sources":[]}`, "kind"},
		{"missing sources", `{"schema_version":1,"kind":"sidekick-events"}`, "sources"},
		{"null sources", `{"schema_version":1,"kind":"sidekick-events","sources":null}`, "sources"},
		{"sources type", `{"schema_version":1,"kind":"sidekick-events","sources":{}}`, "JSON"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := Decode(t.Context(), strings.NewReader(tc.input))
			require.ErrorContains(t, err, tc.want)
		})
	}
}

func TestDecodeRejectsInvalidSources(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, field string
		value       any
		want        string
	}{
		{"missing account", "account", nil, "account"},
		{"empty path", "source", "", "source"},
		{"long account", "account", strings.Repeat("a", MaxMetadataBytes+1), "account"},
		{"long path", "source", strings.Repeat("a", MaxMetadataBytes+1), "source"},
		{"missing Lua", "collections_lua", nil, "collections_lua"},
		{"Lua type", "collections_lua", 1, "JSON"},
		{"Lua assignment", "collections_lua", `DB = {}`, "parse collections_lua"},
		{"Lua suffix", "collections_lua", `{}; run()`, "parse collections_lua"},
		{"Lua identifier", "collections_lua", `{x = global}`, "parse collections_lua"},
		{"Lua malformed", "collections_lua", `{`, "parse collections_lua"},
		{"Lua nesting", "collections_lua", strings.Repeat("{", luadata.MaxDepth+1) + strings.Repeat("}", luadata.MaxDepth+1), "nesting"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			input := source(`{}`)
			input[tc.field] = tc.value
			_, err := Decode(t.Context(), bytes.NewReader(encodeArtifact(t, input)))
			require.ErrorContains(t, err, tc.want)
		})
	}
}

func TestDecodeLimits(t *testing.T) {
	t.Parallel()
	_, err := Decode(t.Context(), strings.NewReader(strings.Repeat(" ", MaxArtifactBytes+1)))
	require.ErrorContains(t, err, "exceeds")
	sources := make([]map[string]any, MaxSources+1)
	for i := range sources {
		sources[i] = source(`{}`)
	}
	_, err = Decode(t.Context(), bytes.NewReader(encodeArtifact(t, sources...)))
	require.ErrorContains(t, err, "source count")
	_, err = Decode(t.Context(), bytes.NewReader(encodeArtifact(t, sources[:MaxSources]...)))
	require.NoError(t, err)
	_, err = Decode(t.Context(), bytes.NewReader(encodeArtifact(t)))
	require.NoError(t, err)
}

func TestDecodeCancellationAndReadErrors(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, err := Decode(ctx, strings.NewReader(`{}`))
	require.ErrorIs(t, err, context.Canceled)
	sentinel := errors.New("read failed")
	_, err = Decode(t.Context(), failingReader{sentinel})
	require.ErrorIs(t, err, sentinel)
	_, err = Decode(t.Context(), bytes.NewReader([]byte{0xff}))
	require.ErrorContains(t, err, "UTF-8")
}

type failingReader struct{ err error }

func (r failingReader) Read([]byte) (int, error) { return 0, r.err }

func FuzzDecode(f *testing.F) {
	f.Add([]byte(`{"schema_version":1,"kind":"sidekick-events","sources":[]}`))
	fixture, err := os.ReadFile("testdata/sidekick-events-v1.json")
	if err != nil {
		f.Fatal(err)
	}
	f.Add(fixture)
	f.Fuzz(func(t *testing.T, input []byte) { _, _ = Decode(t.Context(), bytes.NewReader(input)) })
}
