package authz

import (
	"context"

	"github.com/Emyrk/chronicle/database/authz/debug"
	"github.com/authzed/authzed-go/pkg/requestmeta"
	"github.com/authzed/authzed-go/pkg/responsemeta"
	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/encoding/protojson"

	"cdr.dev/slog"
)

type debugCtxKey struct{}

func debugging(ctx context.Context) bool {
	if v, ok := ctx.Value(debugCtxKey{}).(bool); ok {
		return v
	}
	return false
}

func WithDebugging(ctx context.Context) context.Context {
	return context.WithValue(ctx, debugCtxKey{}, true)
}

func debugSpiceDBRPC(ctx context.Context, logger slog.Logger) (debugCtx context.Context, opt grpc.CallOption, debugString func()) {
	var trailerMD metadata.MD
	ctx = requestmeta.AddRequestHeaders(ctx, requestmeta.RequestDebugInformation)
	debugString = func() {
		if trailerMD.Len() == 0 {
			return
		}

		fields := []any{} // The only way to make the compiler happy
		if count, err := responsemeta.GetIntResponseTrailerMetadata(trailerMD, responsemeta.CachedOperationsCount); err == nil {
			// The number of cached operations hit.
			fields = append(fields, slog.F("cached_operations_count", count))
		}
		if count, err := responsemeta.GetIntResponseTrailerMetadata(trailerMD, responsemeta.DispatchedOperationsCount); err == nil {
			// The number of dispatched operations
			fields = append(fields, slog.F("dispatched_operations_count", count))
		}

		msg := "debug rpc"
		// This debug information key should be present for PermissionChecks. It
		// is not present in all responses (like write responses)
		found, err := responsemeta.GetResponseTrailerMetadata(trailerMD, responsemeta.DebugInformation)
		if err == nil {
			debugInfo := &v1.DebugInformation{}
			err = protojson.Unmarshal([]byte(found), debugInfo)
			if err != nil {
				logger.Debug(ctx, "debug rpc failed: unable to debug proto", slog.Error(err))
				return
			}

			if debugInfo.Check == nil {
				logger.Debug(ctx, "debug rpc: no trace found for the check")
				return
			}
			tp := debug.NewTreePrinter()
			debug.DisplayCheckTrace(debugInfo.Check, tp, false)
			msg = tp.String()
		}

		logger.Debug(ctx, msg, fields...)
	}

	return ctx, grpc.Trailer(&trailerMD), debugString
}
