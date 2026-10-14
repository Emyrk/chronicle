package watch

import (
	"errors"
	"os"
)

// fileSize returns the size of the regular file at path. os.Stat on Windows
// uses GetFileAttributesEx, which reads the directory entry and can lag while
// another process (the game) holds the file open and appends to it. Querying
// through an open handle returns the current size.
func fileSize(path string) (int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer func() { _ = f.Close() }()
	fi, err := f.Stat()
	if err != nil {
		return 0, err
	}
	if fi.IsDir() {
		return 0, errors.New("is a directory")
	}
	return fi.Size(), nil
}
