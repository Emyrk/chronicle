package api

import (
	"context"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/httpcache"
)

func writeCacheableLeaderboardResponse(ctx context.Context, w http.ResponseWriter, status int, response any) {
	httpcache.MarkLeaderboardResponse(w, time.Now())
	httpapi.Write(ctx, w, status, response)
}
