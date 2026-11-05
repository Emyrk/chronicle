package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Not parallel: the fake extractors communicate through process environment variables.
func TestExtractWowdataIconsDefaultsToCurrentForeverTarget(t *testing.T) {
	dir := t.TempDir()
	client := filepath.Join(dir, "client")
	require.NoError(t, os.MkdirAll(filepath.Join(client, "Data"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(client, ".build.info"), nil, 0o644))

	wowdata := filepath.Join(dir, "wowdata")
	require.NoError(t, os.WriteFile(wowdata, []byte("#!/usr/bin/env bash\nexit 0\n"), 0o755))
	extractArgs := filepath.Join(dir, "extract-args")
	iconArgs := filepath.Join(dir, "icon-args")
	t.Setenv("EXTRACT_ARGS", extractArgs)
	t.Setenv("ICON_ARGS", iconArgs)

	extractor := filepath.Join(dir, "extract.sh")
	require.NoError(t, os.WriteFile(extractor, []byte(`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >"$EXTRACT_ARGS"
out=""
while (($# > 0)); do
  if [[ "$1" == "--out" ]]; then out="$2"; break; fi
  shift
done
mkdir -p "$out"
`), 0o755))
	iconExtractor := filepath.Join(dir, "icons.sh")
	require.NoError(t, os.WriteFile(iconExtractor, []byte(`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >"$ICON_ARGS"
`), 0o755))

	var output bytes.Buffer
	inv := ExtractWowdataIconsCmd().Invoke(
		"--dbc", client,
		"--out", filepath.Join(dir, "icons"),
		"--wowdata", wowdata,
		"--extractor", extractor,
		"--icon-extractor", iconExtractor,
	)
	inv.Stdout = &output
	inv.Stderr = &output
	require.NoError(t, inv.Run(), output.String())

	got := strings.Fields(string(requireIconTestFile(t, extractArgs)))
	require.Contains(t, got, "wowf")
	require.Contains(t, got, "latest")
}

func requireIconTestFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	return data
}
