package upload

import (
	"crypto/sha256"
	"fmt"
	"io"
	"os"
)

// SourcePrefix is how many bytes from the start of a log go into its source id:
// enough that two sessions never share a prefix (the log opens with a version
// line and timestamped events), small enough to read before every upload.
const SourcePrefix = 64 << 10

// Identify returns the content-keyed source id of the log at path: the hash of
// its first SourcePrefix bytes, tagged with how many bytes were hashed. It is
// sent as X-Chronicle-Source-Id and is the key of the store's upload ledger, so
// a log keeps its identity across renames, copies and reinstalls.
//
// The id leaves out the file's current size on purpose: a log that grows must
// keep its id, or the server cannot recognise it as the same source and
// replace the group it already parsed. How much of the log reached the server
// is remembered beside the id instead, in store.Log.Size.
//
// A log shorter than SourcePrefix hashes what is there, so its id changes while
// it is still smaller than the prefix. Such a log is a few lines long; it is
// deduplicated from the moment it reaches the usual size.
func Identify(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer func() { _ = f.Close() }()
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(f, SourcePrefix))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("chr1-%d-%x", n, h.Sum(nil)), nil
}

// Have is what the server holds of one source file.
type Have struct {
	// Size is how many bytes of the source the server has; 0 when it has none.
	Size int64
	// ReportURL is where the log it has can be viewed.
	ReportURL string
}
