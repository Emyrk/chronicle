package wdb_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Emyrk/chronicle/internal/wdb"
)

// wdbTestDirs are directories at the project root containing *.wdb files,
// organized by server name. Add a new folder for each server you want to test.
const wdbRoot = "testdata"

func TestParseWDBFiles(t *testing.T) {
	t.Parallel()

	entries, err := os.ReadDir(wdbRoot)
	if err != nil {
		t.Fatal(err)
	}

	var found bool
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		serverDir := filepath.Join(wdbRoot, entry.Name())
		wdbFiles, _ := filepath.Glob(filepath.Join(serverDir, "*.wdb"))
		if len(wdbFiles) == 0 {
			continue
		}

		found = true
		t.Run(entry.Name(), func(t *testing.T) {
			t.Parallel()
			for _, path := range wdbFiles {
				path := path
				t.Run(filepath.Base(path), func(t *testing.T) {
					t.Parallel()
					testParseWDB(t, path)
				})
			}
		})
	}

	if !found {
		t.Skip("no server directories with *.wdb files found at project root")
	}
}

func testParseWDB(t *testing.T, path string) {
	t.Helper()

	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	header, records, err := wdb.Parse(f)
	if err != nil {
		t.Fatal(err)
	}

	t.Logf("signature=%s version=%d locale=%s recordSize=%d recordVersion=%d",
		header.Signature, header.Version, header.Locale, header.RecordSize, header.RecordVersion)
	t.Logf("parsed %d records", len(records))

	for i, rec := range records {
		switch header.Signature {
		case wdb.SigItem:
			item, err := wdb.ParseItem(rec)
			if err != nil {
				t.Errorf("  entry=%d PARSE ERROR: %v", rec.EntryID, err)
				continue
			}
			if i < 10 {
				t.Logf("  [%d] %q  class=%d subclass=%d quality=%d ilvl=%d reqLvl=%d armor=%d",
					item.Entry, item.Name, item.Class, item.SubClass, item.Quality, item.ItemLevel, item.RequiredLevel, item.Armor)
			}
		case wdb.SigCreature:
			c, err := wdb.ParseCreature(rec)
			if err != nil {
				t.Errorf("  entry=%d PARSE ERROR: %v", rec.EntryID, err)
				continue
			}
			if i < 10 {
				t.Logf("  [%d] %q sub=%q type=%d rank=%d displayIDs=[%d,%d,%d,%d]",
					c.Entry, c.Name, c.SubName, c.Type, c.Rank, c.DisplayID[0], c.DisplayID[1], c.DisplayID[2], c.DisplayID[3])
			}
		default:
			if i < 10 {
				t.Logf("  entry=%d dataLen=%d", rec.EntryID, len(rec.Data))
			}
		}
		if i == 10 && len(records) > 10 {
			t.Logf("... and %d more", len(records)-10)
		}
	}
}
