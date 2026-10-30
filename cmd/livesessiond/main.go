// livesessiond is the single-replica in-memory WebRTC signaling daemon.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path"
	"strings"
	"syscall"
	"time"

	"github.com/Emyrk/chronicle/internal/services/servicelivesession"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	secret := os.Getenv("LIVESESSION_INTERNAL_SECRET")
	if secret == "" {
		return errors.New("LIVESESSION_INTERNAL_SECRET is required")
	}
	rawOrigins := os.Getenv("LIVESESSION_ALLOWED_ORIGINS")
	if rawOrigins == "" {
		return errors.New("LIVESESSION_ALLOWED_ORIGINS is required")
	}
	patterns := strings.Split(rawOrigins, ",")
	for i, pattern := range patterns {
		pattern = strings.TrimSpace(pattern)
		parsed, err := url.Parse(pattern)
		if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || (strings.ContainsAny(parsed.Host, "*?[") && (!strings.HasPrefix(parsed.Host, "*.") || strings.Count(parsed.Host, "*") != 1 || strings.ContainsAny(parsed.Host[2:], "?[*") || !strings.Contains(parsed.Host[2:], "."))) {
			return fmt.Errorf("invalid live session origin pattern %q", pattern)
		}
		if _, err := path.Match(pattern, pattern); err != nil {
			return fmt.Errorf("invalid live session origin pattern %q: %w", pattern, err)
		}
		patterns[i] = pattern
	}
	accessURL, err := url.Parse(os.Getenv("CHRONICLE_ACCESS_URL"))
	if err != nil || accessURL.Scheme == "" || accessURL.Host == "" {
		return errors.New("CHRONICLE_ACCESS_URL must be an absolute URL")
	}
	publicAddr := os.Getenv("LIVESESSION_PUBLIC_ADDR")
	if publicAddr == "" {
		publicAddr = ":8080"
	}
	privateAddr := os.Getenv("LIVESESSION_PRIVATE_ADDR")
	if privateAddr == "" {
		privateAddr = "127.0.0.1:8081"
	}
	if publicAddr == privateAddr {
		return errors.New("public and private listeners must use different addresses")
	}
	publicListener, err := net.Listen("tcp", publicAddr)
	if err != nil {
		return fmt.Errorf("public listener: %w", err)
	}
	defer func() { _ = publicListener.Close() }()
	privateListener, err := net.Listen("tcp", privateAddr)
	if err != nil {
		return fmt.Errorf("private listener: %w", err)
	}
	defer func() { _ = privateListener.Close() }()
	service := servicelivesession.New(servicelivesession.Options{AccessURL: accessURL, OriginPatterns: patterns})
	defer service.Close()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go service.RunCleanup(ctx, time.Minute)
	public := &http.Server{Handler: service.PublicHandler(), ReadHeaderTimeout: 5 * time.Second}
	private := &http.Server{Handler: service.PrivateHandler(secret), ReadHeaderTimeout: 5 * time.Second}
	errorsCh := make(chan error, 2)
	go func() { errorsCh <- public.Serve(publicListener) }()
	go func() { errorsCh <- private.Serve(privateListener) }()
	var serveErr error
	select {
	case <-ctx.Done():
	case err := <-errorsCh:
		if !errors.Is(err, http.ErrServerClosed) {
			serveErr = fmt.Errorf("listener stopped: %w", err)
		}
		stop()
	}
	// Closing WebSockets first lets hijacked handler goroutines exit; Shutdown
	// alone does not track upgraded connections.
	service.Close()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := public.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := private.Shutdown(shutdownCtx); err != nil {
		return err
	}
	return serveErr
}
