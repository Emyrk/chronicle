package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStringifyCommand(t *testing.T) {
	t.Parallel()

	inputPath := filepath.Join(t.TempDir(), "combatlog.txt")
	err := os.WriteFile(inputPath, []byte("946728000000|UNKNOWN|value\n"), 0o600)
	if err != nil {
		t.Fatal(err)
	}

	var stdout bytes.Buffer
	inv := Stringify().Invoke(
		"--spell-dbc-path=../../../assets/turtle/Spell.dbc",
		inputPath,
	)
	inv.Stdout = &stdout
	inv.Stderr = &bytes.Buffer{}

	if err := inv.Run(); err != nil {
		t.Fatalf("run stringify command: %v", err)
	}

	got := strings.TrimSpace(stdout.String())
	parts := strings.Split(got, "|")
	if len(parts) != 3 || parts[1] != "UNKNOWN" || parts[2] != "value" {
		t.Fatalf("unexpected output: %q", got)
	}

	gotTime, err := time.ParseInLocation("2006-01-02 15:04:05.000", parts[0], time.Local)
	if err != nil {
		t.Fatalf("parse output timestamp %q: %v", parts[0], err)
	}
	if gotTime.UnixMilli() != 946728000000 {
		t.Fatalf("unexpected output timestamp: %q", parts[0])
	}
}
