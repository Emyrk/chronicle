package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

type manifest struct {
	Names []string `json:"names"`
}

func main() {
	if err := run(); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	root, err := repoRoot()
	if err != nil {
		return err
	}

	iconsDir := filepath.Join(root, "frontend", "imagecache", "icons")
	entries, err := os.ReadDir(iconsDir)
	if err != nil {
		return fmt.Errorf("read icons directory: %w", err)
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".webp") {
			continue
		}

		names = append(names, strings.TrimSuffix(name, filepath.Ext(name)))
	}

	sort.Strings(names)

	outPath := filepath.Join(root, "frontend", "imagecache", "icon-list.json")
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}

	data, err := json.Marshal(manifest{Names: names})
	if err != nil {
		return fmt.Errorf("marshal manifest: %w", err)
	}

	data = append(data, '\n')
	if err := os.WriteFile(outPath, data, 0o644); err != nil {
		return fmt.Errorf("write manifest: %w", err)
	}

	fmt.Printf("generated %s (%d names)\n", outPath, len(names))
	return nil
}

func repoRoot() (string, error) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("failed to resolve current file")
	}

	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..")), nil
}
