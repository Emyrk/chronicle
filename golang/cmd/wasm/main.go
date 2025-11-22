package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"syscall/js"

	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser"
)

func main() {
	js.Global().Set("parseWoWLogs", js.FuncOf(parseLogsFunc))
	fmt.Println("WASM Go parser initialized")
	<-make(chan bool) // Keep the program running
}

func parseLogsFunc(this js.Value, args []js.Value) interface{} {
	if len(args) != 2 {
		return map[string]interface{}{
			"error": "Expected 2 arguments: combatLog and rawCombatLog",
		}
	}

	// Get the two file contents as byte arrays
	combatLogBytes := make([]byte, args[0].Get("byteLength").Int())
	js.CopyBytesToGo(combatLogBytes, args[0])

	rawCombatLogBytes := make([]byte, args[1].Get("byteLength").Int())
	js.CopyBytesToGo(rawCombatLogBytes, args[1])

	// Create readers from the byte arrays
	combatLogReader := bytes.NewReader(combatLogBytes)
	rawCombatLogReader := bytes.NewReader(rawCombatLogBytes)

	// Create a simple logger that writes to console
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelError, // Only show errors in WASM
	}))

	// Create the merger and parser
	m := vanillaparser.Merger(logger)
	liner, scan, err := m.LineScanner(context.Background(), combatLogReader, rawCombatLogReader)
	if err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Failed to create line scanner: %v", err),
		}
	}

	p := vanillaparser.NewFromScanner(logger, liner, scan)

	// Parse all lines
	for {
		_, err = p.Advance()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			// Continue on error
			logger.Error("Error advancing parser", slog.String("error", err.Error()))
		}
	}

	// Get the final state
	state := p.State()

	// Convert state to JSON
	stateJSON, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Failed to marshal state: %v", err),
		}
	}

	return map[string]interface{}{
		"success": true,
		"state":   string(stateJSON),
	}
}
