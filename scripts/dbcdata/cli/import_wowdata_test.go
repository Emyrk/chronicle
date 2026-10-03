package cli

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/coder/serpent"
	"github.com/stretchr/testify/require"
)

func TestValidateWowdataSource(t *testing.T) {
	t.Parallel()

	require.ErrorContains(t, validateWowdataSource("", ""), "exactly one")
	require.ErrorContains(t, validateWowdataSource("snapshot", "client"), "cannot be used together")
	require.NoError(t, validateWowdataSource("snapshot", ""))
	require.NoError(t, validateWowdataSource("", "client"))
}

func TestValidateWowdataExtractionSource(t *testing.T) {
	t.Parallel()

	require.NoError(t, validateWowdataExtractionSource("local"))
	require.NoError(t, validateWowdataExtractionSource("remote"))
	require.ErrorContains(t, validateWowdataExtractionSource("invalid"), "local or remote")
}

func TestWowdataExtractArgs(t *testing.T) {
	t.Parallel()

	got := wowdataExtractArgs(wowdataExtractOptions{
		Client:     "/game",
		WowdataBin: "/bin/wowdata",
		Product:    "wow_classic_beta",
		Build:      "1.60.1.69913",
		Source:     "remote",
		Region:     "us",
		Locale:     "enUS",
		Cache:      "/cache",
		DBCache:    "/game/_classic_beta_/Cache/ADB/enUS/DBCache.bin",
	}, "/snapshot")
	require.Equal(t, []string{
		"--client", "/game",
		"--wowdata", "/bin/wowdata",
		"--product", "wow_classic_beta",
		"--source", "remote",
		"--region", "us",
		"--locale", "enUS",
		"--out", "/snapshot",
		"--build", "1.60.1.69913",
		"--cache", "/cache",
		"--dbcache", "/game/_classic_beta_/Cache/ADB/enUS/DBCache.bin",
	}, got)
}

func TestWowdataExtractArgsOmitsOptionalValues(t *testing.T) {
	t.Parallel()

	got := wowdataExtractArgs(wowdataExtractOptions{
		Client:     "/game",
		WowdataBin: "wowdata",
		Product:    "wow_classic_beta",
		Source:     "local",
		Region:     "eu",
		Locale:     "deDE",
		NoHotfix:   true,
	}, "/snapshot")
	require.NotContains(t, got, "--build")
	require.NotContains(t, got, "--cache")
	require.Contains(t, got, "--no-hotfix")
}

func TestResolveWowdataBinaryUsesRequestedExecutable(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	binary := filepath.Join(dir, "custom-wowdata")
	require.NoError(t, os.WriteFile(binary, []byte("#!/bin/sh\n"), 0o755))

	inv := (&serpent.Invocation{Stdout: &bytes.Buffer{}, Stderr: &bytes.Buffer{}}).WithContext(context.Background())
	got, err := resolveWowdataBinary(inv, binary)
	require.NoError(t, err)
	require.Equal(t, binary, got)
}

func TestResolveWowdataBinaryUsesCachedPinnedBinary(t *testing.T) {
	cacheDir := t.TempDir()
	t.Setenv("XDG_CACHE_HOME", cacheDir)
	t.Setenv("PATH", "")

	binary := filepath.Join(cacheDir, "chronicle", "wowdata", wowdataCommit, "wowdata")
	require.NoError(t, os.MkdirAll(filepath.Dir(binary), 0o755))
	require.NoError(t, os.WriteFile(binary, []byte("#!/bin/sh\n"), 0o755))

	inv := (&serpent.Invocation{Stdout: &bytes.Buffer{}, Stderr: &bytes.Buffer{}}).WithContext(context.Background())
	got, err := resolveWowdataBinary(inv, wowdataDefaultBinary)
	require.NoError(t, err)
	require.Equal(t, binary, got)
}

func TestExtractWowdataUsesTemporarySnapshot(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	extractor := filepath.Join(dir, "extract.sh")
	require.NoError(t, os.WriteFile(extractor, []byte(`#!/usr/bin/env bash
set -euo pipefail
out=""
while (($# > 0)); do
  if [[ "$1" == "--out" ]]; then
    out="$2"
    break
  fi
  shift
done
mkdir -p "$out"
touch "$out/extracted"
`), 0o755))

	var output bytes.Buffer
	inv := (&serpent.Invocation{Stdout: &output, Stderr: &output}).WithContext(context.Background())
	snapshot, cleanup, err := extractWowdata(inv, wowdataExtractOptions{
		Client:     "/game",
		WowdataBin: "wowdata",
		Extractor:  extractor,
		Product:    "wow_classic_beta",
		Build:      "1.60.1.69913",
		Source:     "local",
		Region:     "us",
		Locale:     "enUS",
	})
	require.NoError(t, err)
	require.FileExists(t, filepath.Join(snapshot, "extracted"))
	require.Contains(t, output.String(), "Extracting wow_classic_beta 1.60.1.69913 from /game")

	cleanup()
	require.NoDirExists(t, snapshot)
}
