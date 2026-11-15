// Package parseradmission gates only this process's native parser consumption.
package parseradmission

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const Path = "/api/v1/parser-compatibility"

type Response struct {
	BinaryIdentity      string `json:"binary_identity"`
	DevelopmentOverride bool   `json:"development_override"`
}

var ErrIncompatible = errors.New("primary parser binary is unavailable or incompatible")

type Gate struct {
	checkMu  sync.Mutex
	mu       sync.Mutex
	identity string
	fetch    func(context.Context) (string, error)
	allowed  bool
	closed   bool
	next     uint64
	active   map[uint64]context.CancelFunc
}

func New(identity string, fetch func(context.Context) (string, error)) (*Gate, error) {
	if identity == "" || fetch == nil {
		return nil, errors.New("parser admission requires binary identity and primary fetcher")
	}
	return &Gate{identity: identity, fetch: fetch, active: make(map[uint64]context.CancelFunc)}, nil
}

// HTTPFetcher uses a consistent primary target, not a mixed-build load balancer.
func HTTPFetcher(primary string) (func(context.Context) (string, error), error) {
	u, err := url.Parse(primary)
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("primary URL must be an http(s) origin without credentials, query, or fragment")
	}
	u.Path = strings.TrimRight(u.Path, "/") + Path
	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return func(ctx context.Context) (string, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("Cache-Control", "no-cache, no-store")
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("primary compatibility status %d", resp.StatusCode)
		}
		var body Response
		dec := json.NewDecoder(io.LimitReader(resp.Body, 4096))
		if err := dec.Decode(&body); err != nil {
			return "", err
		}
		if err := dec.Decode(new(any)); err != io.EOF {
			return "", errors.New("invalid trailing compatibility response")
		}
		return body.BinaryIdentity, nil
	}, nil
}

func (g *Gate) check(ctx context.Context) error {
	g.mu.Lock()
	closed := g.closed
	g.mu.Unlock()
	if closed {
		return ErrIncompatible
	}
	identity, err := g.fetch(ctx)
	g.mu.Lock()
	defer g.mu.Unlock()
	g.allowed = err == nil && identity != "" && identity == g.identity
	if !g.allowed {
		for _, cancel := range g.active {
			cancel()
		}
		return ErrIncompatible
	}
	return nil
}

func (g *Gate) Refresh(ctx context.Context) error {
	g.checkMu.Lock()
	defer g.checkMu.Unlock()
	return g.check(ctx)
}

// Admit rechecks the primary at worker entry, covering jobs fetched just before
// queue removal. Checks and registration are serialized so an older successful
// response cannot reopen admission after a newer failure.
func (g *Gate) Admit(ctx context.Context, identity string) (context.Context, context.CancelFunc, error) {
	g.checkMu.Lock()
	defer g.checkMu.Unlock()
	if identity == "" || identity != g.identity {
		return nil, nil, ErrIncompatible
	}
	if err := g.check(ctx); err != nil {
		return nil, nil, err
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if !g.allowed {
		return nil, nil, ErrIncompatible
	}
	child, cancel := context.WithCancel(ctx)
	g.next++
	id := g.next
	g.active[id] = cancel
	return child, func() { cancel(); g.mu.Lock(); delete(g.active, id); g.mu.Unlock() }, nil
}
func (g *Gate) Close() {
	g.checkMu.Lock()
	defer g.checkMu.Unlock()
	g.mu.Lock()
	defer g.mu.Unlock()
	g.allowed = false
	g.closed = true
	for _, cancel := range g.active {
		cancel()
	}
}
