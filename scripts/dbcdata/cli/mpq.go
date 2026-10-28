package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/Gophercraft/core/format/mpq"
)

// mpqFallback provides direct hash-based MPQ file lookups, bypassing the Pool
// which only finds files indexed in MPQ listfiles. Archives are opened once and
// kept open for the lifetime of the fallback.
type mpqFallback struct {
	archives []*mpq.MPQ
}

func newMPQFallback(clientPath string) (*mpqFallback, error) {
	dataDir := filepath.Join(clientPath, "Data")

	var paths []string
	// Walk Data/ and locale subdirs (e.g. Data/enUS/) for MPQ files.
	err := filepath.WalkDir(dataDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable dirs
		}
		if !d.IsDir() && strings.EqualFold(filepath.Ext(d.Name()), ".mpq") {
			paths = append(paths, path)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk Data dir: %w", err)
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("no MPQ files in %s", dataDir)
	}

	// Sort in ascending priority, then reverse so the highest-priority archive
	// is checked first (first-match-wins in ReadFile).
	mpq.SortPatchArchives(paths)
	slices.Reverse(paths)

	fb := &mpqFallback{}
	for _, p := range paths {
		m, err := mpq.Open(p)
		if err != nil {
			continue
		}
		fb.archives = append(fb.archives, m)
	}
	if len(fb.archives) == 0 {
		return nil, fmt.Errorf("could not open any MPQ files in %s", dataDir)
	}
	return fb, nil
}

func (f *mpqFallback) Close() {
	for _, m := range f.archives {
		_ = m.Close()
	}
}

func (f *mpqFallback) ReadFile(name string) ([]byte, error) {
	for _, m := range f.archives {
		file, err := m.OpenFile(name)
		if err != nil {
			// The pinned core MPQ implementation locks GuardFile before querying,
			// but does not unlock it when OpenFile returns an error. Release it so
			// a missing file does not deadlock the next lookup in this archive.
			m.GuardFile.Unlock()
			continue
		}

		data, err := file.ReadBlock()
		_ = file.Close()
		if err != nil {
			continue
		}
		fmt.Printf("[MPQ Direct] OpenFile %q -> %s\n", name, m.Path)
		return data, nil
	}
	return nil, fmt.Errorf("file not found in any MPQ: %s", name)
}
