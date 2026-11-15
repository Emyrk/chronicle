package chronicle

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type debugSpellFixture struct {
	gamedb.GameDB
	spell *chrondbc.Spell
	calls int
	err   error
}

func (d *debugSpellFixture) Spell(context.Context, chrondbc.SpellID) (*chrondbc.Spell, error) {
	d.calls++
	return d.spell, d.err
}
func (d *debugSpellFixture) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	return []*chrondbc.Spell{d.spell}, nil
}
func TestDebugSpellCanonicalBaseline(t *testing.T) {
	t.Parallel()
	base := chrondbc.UnknownSpell(17)
	db := &debugSpellFixture{spell: &base}
	cache := &debugGameDB{spells: db, prepared: map[chrondbc.SpellID]*chrondbc.Spell{}, canonical: map[chrondbc.SpellID]*chrondbc.Spell{}, errors: map[chrondbc.SpellID]error{}}
	a, err := cache.Spell(t.Context(), 17)
	require.NoError(t, err)
	b, err := cache.SpellsByName(t.Context(), "x")
	require.NoError(t, err)
	require.Same(t, a, b[0])
	require.Equal(t, 1, db.calls)
	a.Name_lang[0] = "mutated"
	require.NotEqual(t, a, cache.prepared[17])
	require.Equal(t, base.Name_lang, cache.prepared[17].Name_lang)
	db.err = chrondbc.SpellNotFound(18)
	_, err = cache.Spell(t.Context(), 18)
	require.Error(t, err)
	require.Equal(t, chrondbc.UnknownSpell(18), *cache.prepared[18])
	db.err = errors.New("offline")
	_, err = cache.Spell(t.Context(), 19)
	require.ErrorContains(t, err, "offline")
	require.NotContains(t, cache.prepared, chrondbc.SpellID(19))
}
func TestDebugCompleteCaptureBeforeFinalize(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, true)
	w := &WorkerLogParse{parent: &Chronicle{logger: opts.Logger}}
	data := []byte(inputs[0] + "\n" + inputs[1])
	result, err := w.parseDebugSession(ctx, opts.Compatibility.Source.Format, []database.LogFile{{ID: uuid.New()}}, nil, opts.GameDB, opts.Registry, data, "")
	require.NoError(t, err)
	require.NotNil(t, result.creaturesState)
	require.NotEmpty(t, result.encountersState.Instances)
	var saved bytes.Buffer
	require.NoError(t, result.snapshot(&saved))
	var envelope checkpointEnvelope
	require.NoError(t, json.Unmarshal(saved.Bytes(), &envelope))
	require.EqualValues(t, checkpointVersion, envelope.Version)
	opts.Compatibility = envelope.Compatibility
	opts.Files = nil
	opts.Bundles = nil
	restored, err := RestoreCompleteFileSession(bytes.NewReader(saved.Bytes()), opts)
	require.NoError(t, err)
	require.NoError(t, restored.WireRuntime(ctx))
	finalized, err := restored.Finalize(ctx)
	require.NoError(t, err)
	require.Len(t, finalized, len(result.encountersState.Instances))
	for i, instance := range result.encountersState.Instances {
		got, err := instance.Finalize(ctx)
		require.NoError(t, err)
		require.Equal(t, finalized[i].Encounters, got.Encounters)
	}
	result.encountersState.Finalize()
}
func TestDebugCaptureWriterFailure(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, true)
	s, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.NoError(t, s.ProcessFile(ctx, opts.Files[0], bytes.NewBufferString(inputs[0])))
	require.ErrorIs(t, s.Snapshot(debugFailWriter{}), io.ErrClosedPipe)
}

type debugFailWriter struct{}

func (debugFailWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }

func TestDebugCaptureSupportedFormatMatrix(t *testing.T) {
	t.Parallel()
	for _, tc := range expansionSessionCases() {
		t.Run(string(tc.format)+"/"+tc.flavor.CanonicalKey(), func(t *testing.T) {
			t.Parallel()
			ctx, opts, input := expansionSessionFixture(t, tc, true)
			assertDebugFixtureCapture(t, ctx, opts, input)
		})
	}
	for _, unknown := range []bool{false, true} {
		t.Run(map[bool]string{false: "acore-known", true: "acore-fallback"}[unknown], func(t *testing.T) {
			t.Parallel()
			ctx, opts, input := acoreSessionFixture(t, database.ServerFlavor("azerothcore", database.FlavorWrath), unknown, true)
			assertDebugFixtureCapture(t, ctx, opts, input)
		})
	}
}
func assertDebugFixtureCapture(t *testing.T, ctx context.Context, opts CompleteSessionOptions, input []string) {
	t.Helper()
	w := &WorkerLogParse{parent: &Chronicle{logger: opts.Logger}}
	result, err := w.parseDebugSession(ctx, opts.Compatibility.Source.Format, []database.LogFile{{ID: uuid.New()}}, nil, opts.GameDB, opts.Registry, []byte(strings.Join(input, "\n")), opts.Compatibility.Realm)
	require.NoError(t, err)
	var b bytes.Buffer
	require.NoError(t, result.snapshot(&b))
	require.NotEmpty(t, b.Bytes())
	require.NotNil(t, result.creaturesState)
}
