package cli

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

type dbcFileReaderFunc func(name string) ([]byte, error)

func (f dbcFileReaderFunc) ReadFile(name string) ([]byte, error) {
	return f(name)
}

func TestExtractFilesPrefersDirectMPQLookup(t *testing.T) {
	t.Parallel()

	indexed := dbcFileReaderFunc(func(string) ([]byte, error) {
		t.Fatal("indexed reader should not be used when direct lookup succeeds")
		return nil, nil
	})
	direct := dbcFileReaderFunc(func(name string) ([]byte, error) {
		require.Equal(t, "DBFilesClient\\Talent.dbc", name)
		return []byte("patched"), nil
	})

	files := make(map[DBCFile][]byte)
	require.NoError(t, extractFiles(indexed, direct, files, []DBCFile{FileTalent}))
	require.Equal(t, []byte("patched"), files[FileTalent])
}

func TestExtractFilesFallsBackToIndexedLookup(t *testing.T) {
	t.Parallel()

	direct := dbcFileReaderFunc(func(string) ([]byte, error) {
		return nil, errors.New("file not found in any MPQ")
	})
	indexed := dbcFileReaderFunc(func(name string) ([]byte, error) {
		require.Equal(t, "DBFilesClient\\Talent.dbc", name)
		return []byte("indexed"), nil
	})

	files := make(map[DBCFile][]byte)
	require.NoError(t, extractFiles(indexed, direct, files, []DBCFile{FileTalent}))
	require.Equal(t, []byte("indexed"), files[FileTalent])
}

func TestExtractedDBCVolumeUsesExtractedFiles(t *testing.T) {
	t.Parallel()

	volume := &extractedDBCVolume{files: map[DBCFile][]byte{
		FileTalent: []byte("patched"),
	}}

	got, err := volume.ReadFile("DBFilesClient\\Talent.dbc")
	require.NoError(t, err)
	require.Equal(t, []byte("patched"), got)

	_, err = volume.ReadFile("DBFilesClient\\Spell.dbc")
	require.ErrorContains(t, err, "file not found in extracted DBCs")
}

func TestSpellCompanionImportersPrecedeSpells(t *testing.T) {
	t.Parallel()

	spellIndex := -1
	indexes := make(map[string]int)
	for i, importer := range Registry() {
		indexes[importer.Key()] = i
		if importer.Key() == "spells" {
			spellIndex = i
		}
	}
	require.NotEqual(t, -1, spellIndex, "missing spells importer")

	for _, key := range []string{
		"spell-cast-times",
		"spell-durations",
		"spell-ranges",
		"spell-icons",
		"spell-categories",
		"spell-radii",
		"spell-focus-objects",
		"spell-desc-vars",
	} {
		index, ok := indexes[key]
		require.True(t, ok, "missing importer %q", key)
		require.Less(t, index, spellIndex, "%s must upload before Spell.dbc", key)
	}
}
