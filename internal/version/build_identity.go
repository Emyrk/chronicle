package version

import (
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"runtime"
	"sync"
)

// BinaryIdentity identifies the exact executable bytes, including build tags and
// local changes not represented by GitCommit. It is not a display version. The
// result is computed once for this process; failures must not fall back to a
// release label or "unknown" when deciding snapshot compatibility.
func BinaryIdentity() (string, error) { return executableIdentity() }

var executableIdentity = sync.OnceValues(func() (string, error) {
	// Linux exposes the running inode even if the deployment replaces its path.
	// Do not hash os.Executable(): that path may now refer to a different build.
	if runtime.GOOS != "linux" {
		return "", fmt.Errorf("strict executable identity is unsupported on %s", runtime.GOOS)
	}
	path := "/proc/self/exe"
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open executable identity: %w", err)
	}
	defer func() { _ = file.Close() }()
	return binaryIdentity(file)
})

func binaryIdentity(reader io.Reader) (string, error) {
	hash := sha256.New()
	n, err := io.Copy(hash, reader)
	if err != nil {
		return "", fmt.Errorf("hash executable identity: %w", err)
	}
	if n == 0 {
		return "", fmt.Errorf("empty executable identity")
	}
	return fmt.Sprintf("sha256:%x", hash.Sum(nil)), nil
}
