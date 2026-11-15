package servicestats

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"
)

const (
	// DefaultIndexNowEndpoint shares submissions with every IndexNow engine
	// (Bing, Yandex, Seznam, Naver, ...).
	DefaultIndexNowEndpoint = "https://api.indexnow.org/indexnow"
	// IndexNowKeyPath is where the key file is served on every host.
	IndexNowKeyPath = "/indexnow.txt"

	indexNowTimeout = 10 * time.Second
)

type indexNow struct {
	key      string
	endpoint string
	client   *http.Client
	logger   *slog.Logger
}

func newIndexNow(key, endpoint string, client *http.Client, logger *slog.Logger) (*indexNow, error) {
	if !indexNowKeyPattern.MatchString(key) {
		return nil, fmt.Errorf("servicestats: IndexNow key must be 8-128 letters, digits or dashes")
	}
	if endpoint == "" {
		endpoint = DefaultIndexNowEndpoint
	}
	if client == nil {
		client = &http.Client{Timeout: indexNowTimeout}
	}
	return &indexNow{key: key, endpoint: endpoint, client: client, logger: logger}, nil
}

type indexNowRequest struct {
	Host        string   `json:"host"`
	Key         string   `json:"key"`
	KeyLocation string   `json:"keyLocation"`
	URLList     []string `json:"urlList"`
}

// ping submits urls (all on origin) to IndexNow. Best effort: failures are
// logged, never returned, so they cannot fail the snapshot job.
func (in *indexNow) ping(ctx context.Context, origin string, urls []string) {
	if len(urls) == 0 {
		return
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		in.logger.WarnContext(ctx, "indexnow: invalid origin", slog.String("origin", origin))
		return
	}
	body, err := json.Marshal(indexNowRequest{
		Host:        u.Host,
		Key:         in.key,
		KeyLocation: origin + IndexNowKeyPath,
		URLList:     urls,
	})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, indexNowTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, in.endpoint, bytes.NewReader(body))
	if err != nil {
		in.logger.WarnContext(ctx, "indexnow: build request", slog.String("error", err.Error()))
		return
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	resp, err := in.client.Do(req)
	if err != nil {
		in.logger.WarnContext(ctx, "indexnow: ping failed", slog.String("host", u.Host), slog.String("error", err.Error()))
		return
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	// 200 and 202 both mean accepted.
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		in.logger.WarnContext(ctx, "indexnow: ping rejected", slog.String("host", u.Host), slog.Int("status", resp.StatusCode))
		return
	}
	in.logger.InfoContext(ctx, "indexnow: pinged", slog.String("host", u.Host), slog.Int("urls", len(urls)))
}

// IndexNowKeyHandler serves the IndexNow key file, or 404 when IndexNow is off.
func (s *Service) IndexNowKeyHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.indexNow == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		_, _ = io.WriteString(w, s.indexNow.key)
	})
}
