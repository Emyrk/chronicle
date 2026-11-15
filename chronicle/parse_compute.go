package chronicle

import (
	"context"
	"io"
	"log/slog"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/storage"
)

// parseCompute is the plain parsing capability shared by worker adapters. It
// consumes caller-selected inputs and dataset dependencies and returns the full
// pre-finalize result. It has no authorization or publication dependency.
//
// loadFile must preserve logical-file boundaries (including ready append parts).
// It is not permission to treat storage chunks as CompleteFileSession inputs.
// Dataset authority, input snapshot selection, and persistence fences remain
// caller responsibilities; a headless adapter must supply those explicitly.
type parseCompute struct {
	logger          *slog.Logger
	storage         storage.ObjectStorage
	parserEngine    chroniclesdk.ParserEngine
	emitParsingLogs bool
	loadFile        func(context.Context, database.LogFile) (io.Reader, error)
}

func (w *WorkerLogParse) compute() *parseCompute {
	return &parseCompute{
		logger:          w.parent.logger,
		storage:         w.parent.Storage,
		parserEngine:    w.parserEngine,
		emitParsingLogs: w.parent.EmitParsingLogs(),
		loadFile:        w.loadFile,
	}
}

// The worker adapters retain the existing execution and profiling boundaries.
// In particular this extraction does not move deletion or switch queue roles.
func (w *WorkerLogParse) parseCombatLog(ctx context.Context, format database.LogFormat, files []database.LogFile, artifacts []database.LogGroupArtifact, db gamedb.GameDB, reg *registry.Registry, identityMode bool, preloaded []byte, realm string) (*parseResult, error) {
	// Preserve rejection before constructing or accessing caller dependencies.
	if w.parserEngine != "" {
		if err := w.parserEngine.ValidateFormat(format); err != nil {
			return nil, err
		}
	}
	return w.compute().parseCombatLog(ctx, format, files, artifacts, db, reg, identityMode, preloaded, realm)
}

func (w *WorkerLogParse) parseDebugSession(ctx context.Context, format database.LogFormat, files []database.LogFile, artifacts []database.LogGroupArtifact, db gamedb.GameDB, reg *registry.Registry, preloaded []byte, realm string) (*parseResult, error) {
	return w.compute().parseDebugSession(ctx, format, files, artifacts, db, reg, preloaded, realm)
}

func (w *parseCompute) loadFileBytes(ctx context.Context, file database.LogFile) ([]byte, error) {
	reader, err := w.loadFile(ctx, file)
	if err != nil {
		return nil, err
	}
	return io.ReadAll(reader)
}
