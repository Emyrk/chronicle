//go:build !windows

package watch

import (
	"errors"
	"os"
)

// fileSize returns the size of the regular file at path.
func fileSize(path string) (int64, error) {
	fi, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	if fi.IsDir() {
		return 0, errors.New("is a directory")
	}
	return fi.Size(), nil
}
