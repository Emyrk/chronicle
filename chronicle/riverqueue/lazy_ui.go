package riverqueue

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

const riverUIIdleTimeout = 5 * time.Minute
const riverUICloseTimeout = 10 * time.Second

// lazyUI owns only the UI's context, never the River worker client's context.
// riverui v0.14 has no public Stop or Stopped method. Cancelling its Start
// context stops its background services asynchronously. Always construct a fresh
// handler: reusing one is not part of riverui's public lifecycle contract.
type lazyUI struct {
	ctx       context.Context
	cancel    context.CancelFunc
	logger    *slog.Logger
	start     func(context.Context) (http.Handler, error)
	mu        sync.Mutex
	current   *uiGeneration
	closed    bool
	work      sync.WaitGroup
	done      chan struct{}
	stopWatch func() bool
}

type uiGeneration struct {
	ready       chan struct{}
	handler     http.Handler
	err         error
	cancel      context.CancelFunc
	lastRequest time.Time
	active      int
	timer       *time.Timer
}

func newLazyUI(parent context.Context, logger *slog.Logger, start func(context.Context) (http.Handler, error)) *lazyUI {
	ctx, cancel := context.WithCancel(parent)
	u := &lazyUI{ctx: ctx, cancel: cancel, logger: logger, start: start, done: make(chan struct{})}
	u.stopWatch = context.AfterFunc(ctx, u.shutdown)
	return u
}

func (u *lazyUI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	u.mu.Lock()
	if u.closed || u.ctx.Err() != nil || r.Context().Err() != nil {
		u.mu.Unlock()
		u.unavailable(w, r)
		return
	}
	g := u.current
	if g == nil {
		ctx, cancel := context.WithCancel(u.ctx)
		g = &uiGeneration{ready: make(chan struct{}), cancel: cancel}
		u.current = g
		u.work.Add(1)
		go u.activate(ctx, g)
	}
	// Count requests waiting for startup too, so expiry cannot discard their UI.
	g.active++
	g.lastRequest = time.Now()
	if g.timer != nil {
		g.timer.Stop()
	}
	u.work.Add(1)
	u.mu.Unlock()
	defer u.release(g)

	select {
	case <-r.Context().Done():
		return
	case <-u.ctx.Done():
		u.unavailable(w, r)
		return
	case <-g.ready:
	}
	if g.err != nil || u.ctx.Err() != nil {
		u.unavailable(w, r)
		return
	}
	// Server shutdown cancels in-flight UI requests as well as background queries.
	ctx, cancel := context.WithCancel(r.Context())
	stop := context.AfterFunc(u.ctx, cancel)
	defer stop()
	defer cancel()
	g.handler.ServeHTTP(w, r.WithContext(ctx))
}

func (u *lazyUI) activate(ctx context.Context, g *uiGeneration) {
	defer u.work.Done()
	handler, err := u.start(ctx)
	if err != nil {
		g.cancel() // Signal cleanup of partially started services before retrying.
	}
	u.mu.Lock()
	g.handler, g.err = handler, err
	close(g.ready)
	if err != nil {
		if u.current == g {
			u.current = nil
		}
	} else if !u.closed && g.active == 0 {
		u.arm(g)
	}
	u.mu.Unlock()
	if err != nil {
		u.logger.ErrorContext(u.ctx, "start River UI", "error", err)
	}
}

func (u *lazyUI) release(g *uiGeneration) {
	defer u.work.Done()
	u.mu.Lock()
	defer u.mu.Unlock()
	g.active--
	if !u.closed && u.current == g && g.active == 0 {
		select {
		case <-g.ready:
			u.arm(g)
		default:
		}
	}
}

// Called under mu. Long requests defer idle cancellation until their release;
// they do not extend the deadline beyond the time of the last request arrival.
func (u *lazyUI) arm(g *uiGeneration) {
	if g.timer != nil {
		g.timer.Stop()
	}
	g.timer = time.AfterFunc(time.Until(g.lastRequest.Add(riverUIIdleTimeout)), func() {
		u.mu.Lock()
		// A stopped timer callback may already be waiting on mu. Recheck both the
		// generation and the deadline so it cannot cancel a refreshed activation.
		expired := !u.closed && u.current == g && g.active == 0 && !time.Now().Before(g.lastRequest.Add(riverUIIdleTimeout))
		if expired {
			// Cancellation only signals riverui; it does not wait for slow queries.
			g.cancel()
			u.current = nil
		}
		u.mu.Unlock()
	})
}

func (u *lazyUI) unavailable(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "River UI is temporarily unavailable."})
}

func (u *lazyUI) shutdown() {
	u.mu.Lock()
	if u.closed {
		u.mu.Unlock()
		return
	}
	u.closed = true
	if u.current != nil && u.current.timer != nil {
		u.current.timer.Stop()
	}
	u.mu.Unlock()
	u.cancel()
	go func() {
		u.work.Wait()
		close(u.done)
	}()
}

func (u *lazyUI) Close(ctx context.Context) error {
	u.stopWatch()
	u.shutdown()
	ctx, cancel := context.WithTimeout(ctx, riverUICloseTimeout)
	defer cancel()
	select {
	case <-u.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
