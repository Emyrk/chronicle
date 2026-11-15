package riverqueue

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/require"
)

func uiRequest(u *lazyUI) int {
	w := httptest.NewRecorder()
	u.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/river/", nil))
	return w.Code
}

func uiLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestLazyUIIdleLifecycle(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		var contexts []context.Context
		u := newLazyUI(t.Context(), uiLogger(), func(ctx context.Context) (http.Handler, error) {
			contexts = append(contexts, ctx)
			return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }), nil
		})
		defer func() { require.NoError(t, u.Close(context.Background())) }()
		// All sleeps in these tests advance synctest's virtual clock, not wall time.
		time.Sleep(2 * riverUIIdleTimeout)
		require.Empty(t, contexts)
		require.Equal(t, http.StatusNoContent, uiRequest(u))
		require.Len(t, contexts, 1)
		time.Sleep(4 * time.Minute)
		require.Equal(t, http.StatusNoContent, uiRequest(u))
		time.Sleep(time.Minute)
		synctest.Wait()
		require.NoError(t, contexts[0].Err(), "request refreshed the deadline")
		time.Sleep(4 * time.Minute)
		synctest.Wait()
		require.ErrorIs(t, contexts[0].Err(), context.Canceled)
		require.Equal(t, http.StatusNoContent, uiRequest(u))
		require.Len(t, contexts, 2)
		require.NoError(t, contexts[1].Err())
	})
}

func TestLazyUIConcurrentActivation(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		started, resume := make(chan struct{}), make(chan struct{})
		starts := 0
		u := newLazyUI(t.Context(), uiLogger(), func(context.Context) (http.Handler, error) {
			starts++
			close(started)
			<-resume
			return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }), nil
		})
		defer func() { require.NoError(t, u.Close(context.Background())) }()
		const requests = 20
		codes := make(chan int, requests)
		for range requests {
			go func() { codes <- uiRequest(u) }()
		}
		<-started
		synctest.Wait()
		require.Equal(t, 1, starts)
		time.Sleep(2 * riverUIIdleTimeout)
		synctest.Wait()
		require.Equal(t, 1, starts)
		close(resume)
		for range requests {
			require.Equal(t, http.StatusNoContent, <-codes)
		}
		synctest.Wait()
	})
}

func TestLazyUIActiveRequestDefersIdleStop(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		entered, resume, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
		var serviceCtx context.Context
		u := newLazyUI(t.Context(), uiLogger(), func(ctx context.Context) (http.Handler, error) {
			serviceCtx = ctx
			return http.HandlerFunc(func(http.ResponseWriter, *http.Request) { close(entered); <-resume }), nil
		})
		defer func() { require.NoError(t, u.Close(context.Background())) }()
		go func() { uiRequest(u); close(done) }()
		<-entered
		time.Sleep(2 * riverUIIdleTimeout)
		synctest.Wait()
		require.NoError(t, serviceCtx.Err())
		close(resume)
		<-done
		synctest.Wait()
		require.ErrorIs(t, serviceCtx.Err(), context.Canceled)
	})
}

func TestLazyUIStartupFailureRetries(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		attempts := 0
		var failedCtx context.Context
		u := newLazyUI(t.Context(), uiLogger(), func(ctx context.Context) (http.Handler, error) {
			attempts++
			if attempts == 1 {
				failedCtx = ctx
				return nil, errors.New("startup failed")
			}
			return http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}), nil
		})
		defer func() { require.NoError(t, u.Close(context.Background())) }()
		require.Equal(t, http.StatusServiceUnavailable, uiRequest(u))
		synctest.Wait()
		require.ErrorIs(t, failedCtx.Err(), context.Canceled)
		require.Equal(t, http.StatusOK, uiRequest(u))
		require.Equal(t, 2, attempts)
	})
}

func TestLazyUIShutdownDuringStartup(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		started := make(chan struct{})
		u := newLazyUI(t.Context(), uiLogger(), func(ctx context.Context) (http.Handler, error) {
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		})
		code := make(chan int, 1)
		go func() { code <- uiRequest(u) }()
		<-started
		require.NoError(t, u.Close(context.Background()))
		require.Equal(t, http.StatusServiceUnavailable, <-code)
		require.Equal(t, http.StatusServiceUnavailable, uiRequest(u))
		require.NoError(t, u.Close(context.Background()))
	})
}

func TestLazyUIParentShutdownCancelsRequests(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		parent, cancel := context.WithCancel(t.Context())
		defer cancel()
		entered := make(chan struct{})
		u := newLazyUI(parent, uiLogger(), func(context.Context) (http.Handler, error) {
			return http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { close(entered); <-r.Context().Done() }), nil
		})
		var requests sync.WaitGroup
		requests.Go(func() { uiRequest(u) })
		<-entered
		cancel()
		require.NoError(t, u.Close(context.Background()))
		requests.Wait()
		require.Equal(t, http.StatusServiceUnavailable, uiRequest(u))
	})
}

func TestLazyUICanceledWaiterDoesNotCancelSharedStartup(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		started, resume := make(chan struct{}), make(chan struct{})
		var serviceCtx context.Context
		starts := 0
		u := newLazyUI(t.Context(), uiLogger(), func(ctx context.Context) (http.Handler, error) {
			starts++
			serviceCtx = ctx
			close(started)
			<-resume
			return http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}), nil
		})
		defer func() { require.NoError(t, u.Close(context.Background())) }()
		ctx, cancel := context.WithCancel(t.Context())
		firstDone := make(chan struct{})
		go func() {
			u.ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(ctx, http.MethodGet, "/river/", nil))
			close(firstDone)
		}()
		<-started
		cancel()
		<-firstDone
		require.NoError(t, serviceCtx.Err())
		next := make(chan int, 1)
		go func() { next <- uiRequest(u) }()
		synctest.Wait()
		close(resume)
		require.Equal(t, http.StatusOK, <-next)
		require.Equal(t, 1, starts)
	})
}

func TestLazyUICanceledParentNeverActivates(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		cancel()
		starts := 0
		u := newLazyUI(ctx, uiLogger(), func(context.Context) (http.Handler, error) { starts++; return nil, errors.New("unexpected startup") })
		require.Equal(t, http.StatusServiceUnavailable, uiRequest(u))
		require.NoError(t, u.Close(context.Background()))
		require.Zero(t, starts)
	})
}

func TestLazyUICloseIsBounded(t *testing.T) {
	t.Parallel()
	synctest.Test(t, func(t *testing.T) {
		started, resume := make(chan struct{}), make(chan struct{})
		u := newLazyUI(t.Context(), uiLogger(), func(context.Context) (http.Handler, error) {
			close(started)
			<-resume // Deliberately uncooperative startup, released after the bound.
			return http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}), nil
		})
		done := make(chan struct{})
		go func() { uiRequest(u); close(done) }()
		<-started
		require.ErrorIs(t, u.Close(context.Background()), context.DeadlineExceeded)
		close(resume)
		<-done
		require.NoError(t, u.Close(context.Background()))
	})
}
