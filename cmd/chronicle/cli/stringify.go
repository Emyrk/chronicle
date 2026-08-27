package cli

import (
	"bufio"
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/coder/serpent"

	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

func Stringify() *serpent.Command {
	spellDBCPath := defaultSpellDBCPath()

	cmd := &serpent.Command{
		Use:        "stringify <file>",
		Short:      "Convert raw combat log lines to human-readable format",
		Middleware: serpent.RequireNArgs(1),
		Options: serpent.OptionSet{
			{
				Name:        "spell-dbc-path",
				Description: "Path to Spell.dbc file.",
				Flag:        "spell-dbc-path",
				Env:         "CHRONICLE_SPELL_DBC_PATH",
				Default:     spellDBCPath,
				Value:       serpent.StringOf(&spellDBCPath),
			},
		},
		Handler: func(i *serpent.Invocation) error {
			wdb, err := gamedb.New(i.Context(), gamedb.Options{
				SpellsDBCPath: spellDBCPath,
			})
			if err != nil {
				return fmt.Errorf("open game database: %w", err)
			}
			defer func() { _ = wdb.Close() }()

			files, err := openFileReaders(i.Args[0])
			if err != nil {
				return err
			}
			defer closeFiles(files...)

			scanner := bufio.NewScanner(files[0])
			for scanner.Scan() {
				line := scanner.Text()
				pretty := stringifyLine(line, wdb)
				_, _ = fmt.Fprintln(i.Stdout, pretty)
			}

			return scanner.Err()
		},
	}

	return cmd
}

// stringifyLine converts a raw log line to human-readable format.
// Input:  1771959200822|SPELL_DMG|...|19659|...
// Output: 2026-02-24 19:20:00.822|SPELL_DMG|...|19659(Shadowbolt)|...
func stringifyLine(line string, wdb *gamedb.WoWDB) string {
	parts := strings.Split(line, "|")
	if len(parts) < 2 {
		return line // Can't parse, return as-is
	}

	// Convert timestamp (first field)
	if unixMilli, err := strconv.ParseInt(parts[0], 10, 64); err == nil {
		t := time.UnixMilli(unixMilli)
		parts[0] = t.Format("2006-01-02 15:04:05.000")
	}

	// Get event type to know where spell IDs might be
	eventType := parts[1]

	// Stringify spell IDs based on event type
	switch eventType {
	case "SPELL_DMG", "HEAL", "MISS", "ENERGIZE":
		// Format: ts|event|target|caster|spellID|...
		stringifySpellAt(parts, 4, wdb)
	case "BUFF_ADD", "BUFF_REM", "DEBUFF_ADD", "DEBUFF_REM":
		// Format: ts|event|target|buffSlot|spellID|...
		stringifySpellAt(parts, 4, wdb)
	case "SPELL_GO":
		// Format: ts|event|itemID|spellID|caster|target|...
		stringifySpellAt(parts, 3, wdb)
	case "AURA_CAST":
		// Format: ts|event|spellID|caster|target|...
		stringifySpellAt(parts, 2, wdb)
	}

	return strings.Join(parts, "|")
}

func stringifySpellAt(parts []string, idx int, wdb *gamedb.WoWDB) {
	if idx >= len(parts) {
		return
	}

	spellID, err := strconv.ParseInt(parts[idx], 10, 32)
	if err != nil || spellID == 0 {
		return
	}

	spell, err := wdb.Spell(context.Background(), chrondbc.SpellID(spellID))
	if err != nil || spell == nil {
		return
	}

	parts[idx] = fmt.Sprintf("%d(%s)", spellID, spell.Name())
}
