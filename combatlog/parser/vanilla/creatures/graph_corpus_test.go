package creatures_test

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

// This is the existing no-DB CCv2 harness's UnknownSpell fallback, deliberately
// explicit in evidence: it tests character graph continuation, not dataset parity.
type graphCorpusSpells struct{}

func (graphCorpusSpells) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	v := chrondbc.UnknownSpell(id)
	return &v, nil
}

// TestCharacterGraphCapybara uses a REDUCED recipe (NewNefarian + Common fallback,
// UnknownSpell), not production character semantics or a production dataset.
// The line-20000 checkpoint is a quiescent MESSAGE-BATCH boundary, not proof of
// the complete-file snapshot API. Full-session comparison remains out of scope.
func TestCharacterGraphCapybara(t *testing.T) {
	path := os.Getenv("CHRONICLE_CHARACTER_GRAPH_FIXTURE")
	if path == "" {
		t.Skip("bounded local immutable corpus opt-in")
	}
	compressed, e := os.ReadFile(path)
	require.NoError(t, e)
	reader, e := gzip.NewReader(bytes.NewReader(compressed))
	require.NoError(t, e)
	raw, e := io.ReadAll(io.LimitReader(reader, 4<<20))
	require.NoError(t, e)
	require.NoError(t, reader.Close())
	require.Less(t, len(raw), 4<<20)
	hash := sha256.Sum256(raw)
	require.Equal(t, "54b37237412d07004046ddd4122221f1c75c7000ff64a523f41d007ecf0777af", hex.EncodeToString(hash[:]))
	idRecipe := identifier.TrustedRecipe{ID: "capybara-bwl-empty-classifier/v1", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	recipe := characters.TrustedFactoryRecipe{ID: "capybara-bounded-nefarian/v1", FactoryIDs: []string{"vanilla.NewNefarian"}, Factories: []characters.CharacterFactory{creatures.NewNefarian}}
	registry := ownergraph.NewRegistry()
	require.NoError(t, characters.RegisterGraphOwners(registry, characters.GraphOptions{Factories: recipe, Identifier: idRecipe}))
	require.NoError(t, characters.RegisterAdsGraphOwner(registry))
	require.NoError(t, creatures.RegisterNefarianGraphOwner(registry))
	require.NoError(t, period.RegisterGraphOwners(registry))
	require.NoError(t, messages.RegisterDamageGraphOwner(registry))
	require.NoError(t, unitdb.RegisterGraphOwner(registry))
	require.NoError(t, identifier.RegisterGraphOwner(registry, idRecipe))
	require.NoError(t, ownergraph.Register(registry, ownergraph.Codec[chrondbc.Spell]{Type: "test.UnknownSpellRecipe", Version: 1, Init: func() *chrondbc.Spell { return new(chrondbc.Spell) }, Capture: func(s *chrondbc.Spell, _ *ownergraph.Capture) ([]byte, error) {
		require.Equal(t, chrondbc.UnknownSpell(s.ID), *s, "trusted fallback spell recipe must match exactly")
		return json.Marshal(s.ID)
	}, Restore: func(s *chrondbc.Spell, _ uint32, b []byte, _ *ownergraph.Restore) error {
		var id chrondbc.SpellID
		if e := json.Unmarshal(b, &id); e != nil {
			return e
		}
		*s = chrondbc.UnknownSpell(id)
		return nil
	}}))
	newChars := func() *characters.Characters {
		id, e := idRecipe.New()
		require.NoError(t, e)
		c, e := recipe.New(unitdb.New(), id)
		require.NoError(t, e)
		return c
	}
	control, candidate := newChars(), newChars()
	source := func() *next.Source {
		decoder := next.NewDecoder(graphCorpusSpells{}, "graph-corpus/v1")
		s, e := next.NewSource(bytes.NewReader(raw), 4<<20, decoder)
		require.NoError(t, e)
		return s
	}
	left, right := source(), source()
	line, messagesSeen, boundary := 0, 0, 0
	counts := map[string]int{}
	for {
		batch, err := left.Advance(t.Context())
		other, otherErr := right.Advance(t.Context())
		if err == io.EOF {
			require.ErrorIs(t, otherErr, io.EOF)
			break
		}
		line++
		require.NoError(t, err, fmt.Sprintf("physical line %d", line))
		require.NoError(t, otherErr)
		require.Equal(t, batch, other, "identical source batches before character processing")
		for i, m := range batch {
			require.NoError(t, control.DB().ProcessMessage(m))
			_, e = control.Process(m)
			require.NoError(t, e)
			require.NoError(t, candidate.DB().ProcessMessage(other[i]))
			_, e = candidate.Process(other[i])
			require.NoError(t, e)
			messagesSeen++
		}
		// Between complete source batches and outside callbacks: quiescent character
		// boundary only. Parser source/full-session capture is explicitly not claimed.
		if boundary == 0 && line >= 20000 {
			snap, e := registry.Capture(candidate)
			require.NoError(t, e, "line %d", line)
			for _, n := range snap.Graph.Nodes {
				if n.Kind == stategraph.KindValue {
					counts[n.Type]++
				}
			}
			require.Greater(t, counts[characters.RoomMechanicStateType], 1)
			root, e := registry.Restore(snap)
			require.NoError(t, e)
			candidate = root.(*characters.Characters)
			require.NoError(t, candidate.WireGraphRuntime())
			boundary = line
			t.Logf("boundary_decoded_messages=%d", messagesSeen)
			again, e := registry.Capture(candidate)
			require.NoError(t, e)
			require.Equal(t, snap, again)
		}
	}
	require.NotZero(t, boundary)
	expected, e := registry.Capture(control)
	require.NoError(t, e)
	actual, e := registry.Capture(candidate)
	require.NoError(t, e)
	require.Equal(t, expected, actual)
	if dir := os.Getenv("CHRONICLE_CHARACTER_GRAPH_EVIDENCE"); dir != "" {
		require.NoError(t, os.MkdirAll(dir, 0755))
		for name, snapshot := range map[string]ownergraph.Snapshot{"control-final": expected, "restored-final": actual} {
			b, e := json.MarshalIndent(snapshot, "", "  ")
			require.NoError(t, e)
			require.NoError(t, os.WriteFile(filepath.Join(dir, name+".json"), b, 0644))
		}
	}
	t.Logf("fixture_sha256=%x physical_lines=%d decoded_messages=%d boundary_line=%d owner_types=%v", hash, line, messagesSeen, boundary, counts)
}
