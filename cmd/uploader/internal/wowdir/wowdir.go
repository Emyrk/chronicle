// Package wowdir locates a World of Warcraft install and its combat log
// directory without assuming a particular flavor folder name.
package wowdir

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// flavorInfo is the marker file the Blizzard client writes into every flavor
// folder (_retail_, _classic_, _classic_beta_, ...).
const flavorInfo = ".flavor.info"

// ErrNotFound is returned when no flavor folder can be found at a path.
var ErrNotFound = errors.New("no World of Warcraft install found")

// Install is a single flavor folder of a WoW install.
type Install struct {
	// Flavor is the flavor folder name, e.g. "_classic_beta_".
	Flavor string
	// Dir is the flavor folder.
	Dir string
	// LogDir is where the client writes combat logs: <Dir>/Logs.
	LogDir string
}

func newInstall(dir string) Install {
	return Install{Flavor: filepath.Base(dir), Dir: dir, LogDir: filepath.Join(dir, "Logs")}
}

// StandardRoots lists the places WoW is commonly installed on this OS.
func StandardRoots() []string {
	home, _ := os.UserHomeDir()
	var roots []string
	switch runtime.GOOS {
	case "darwin":
		roots = append(roots, "/Applications/World of Warcraft")
		if home != "" {
			roots = append(roots, filepath.Join(home, "Applications", "World of Warcraft"))
		}
	case "windows":
		for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles"} {
			if p := os.Getenv(env); p != "" {
				roots = append(roots, filepath.Join(p, "World of Warcraft"))
			}
		}
		roots = append(roots,
			`C:\Program Files (x86)\World of Warcraft`,
			`C:\Program Files\World of Warcraft`,
		)
		for _, drive := range []string{"C", "D", "E", "F"} {
			roots = append(roots, drive+`:\Games\World of Warcraft`)
		}
	default:
		if home == "" {
			break
		}
		roots = append(roots,
			filepath.Join(home, ".wine", "drive_c", "Program Files (x86)", "World of Warcraft"),
			filepath.Join(home, "Games", "world-of-warcraft"),
		)
		// Lutris / Battle.net prefixes: ~/Games/<name>/drive_c/Program Files (x86)/World of Warcraft
		for _, pattern := range []string{
			filepath.Join(home, "Games", "*", "drive_c", "Program Files (x86)", "World of Warcraft"),
			filepath.Join(home, ".local", "share", "lutris", "runners", "wine", "*", "drive_c", "Program Files (x86)", "World of Warcraft"),
			filepath.Join(home, ".local", "share", "bottles", "bottles", "*", "drive_c", "Program Files (x86)", "World of Warcraft"),
		} {
			matches, _ := filepath.Glob(pattern)
			roots = append(roots, matches...)
		}
	}
	return roots
}

// Detect scans install roots for flavor folders.
func Detect(roots []string) []Install {
	var out []Install
	seen := map[string]bool{}
	for _, root := range roots {
		for _, inst := range scan(root) {
			if !seen[inst.Dir] {
				seen[inst.Dir] = true
				out = append(out, inst)
			}
		}
	}
	return out
}

// Resolve normalises a user-chosen path to the flavor folders it refers to.
// The path may be an install root, a flavor folder, a flavor's Logs folder, an
// application bundle (.app), or the game executable itself.
func Resolve(path string) ([]Install, error) {
	path = filepath.Clean(path)
	fi, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	// Only walk upwards when the user pointed *into* an install (an exe, an
	// .app bundle or its guts, or the Logs folder), never from a plain folder.
	climb := 0
	dir := path
	if !fi.IsDir() {
		dir, climb = filepath.Dir(path), 5
	} else if strings.Contains(strings.ToLower(path), ".app") || strings.EqualFold(filepath.Base(path), "Logs") {
		climb = 5
	}

	for {
		if exists(filepath.Join(dir, flavorInfo)) {
			return []Install{newInstall(dir)}, nil
		}
		if found := scan(dir); len(found) > 0 {
			return found, nil
		}
		parent := filepath.Dir(dir)
		if climb == 0 || parent == dir {
			return nil, ErrNotFound
		}
		dir, climb = parent, climb-1
	}
}

// scan returns the flavor folders directly inside root.
func scan(root string) []Install {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []Install
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() || !strings.HasPrefix(name, "_") || !strings.HasSuffix(name, "_") {
			continue
		}
		dir := filepath.Join(root, name)
		if exists(filepath.Join(dir, flavorInfo)) {
			out = append(out, newInstall(dir))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Dir < out[j].Dir })
	return out
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
