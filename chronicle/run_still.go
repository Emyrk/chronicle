package chronicle

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/chromedp/chromedp"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	KindRenderRunStill = "render-run-still"

	// RunStillWidth and RunStillHeight are the still's size in CSS pixels.
	RunStillWidth  = 640
	RunStillHeight = 360

	// runStillCapability is the log capability a run needs for a replay still.
	runStillCapability = "unit-position"
	// runStillReadyTimeout bounds how long the page has to load the run and the map.
	runStillReadyTimeout = 90 * time.Second
	// runStillSettle lets the replay move and the tiles finish once the page reports ready.
	runStillSettle = 1500 * time.Millisecond
)

// ArgsRenderRunStill renders the replay still of one public instance.
type ArgsRenderRunStill struct {
	InstanceID uuid.UUID `json:"instance_id"`
}

func (ArgsRenderRunStill) Kind() string { return KindRenderRunStill }

func (ArgsRenderRunStill) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRunStills,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 2,
		// One render per instance per day, however often the still is asked for before it exists.
		UniqueOpts: river.UniqueOpts{
			ByArgs:   true,
			ByPeriod: 24 * time.Hour,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
				rivertype.JobStateRetryable,
				rivertype.JobStateCompleted,
			},
		},
	}
}

// RunStillOptions configures the headless renderer. An empty ChromePath disables stills.
type RunStillOptions struct {
	// ChromePath is the Chrome or Chromium binary the renderer drives.
	ChromePath string
	// BaseURL is the site the renderer opens the still page on (the access URL).
	BaseURL string
}

// SetRunStillOptions enables replay stills; call before the queue starts.
func (c *Chronicle) SetRunStillOptions(opts RunStillOptions) {
	c.runStill = opts
}

// RunStillsEnabled reports whether this server renders replay stills.
func (c *Chronicle) RunStillsEnabled() bool {
	return c.runStill.ChromePath != "" && c.runStill.BaseURL != ""
}

func runStillKey(instanceID uuid.UUID) string {
	return "stills/" + instanceID.String() + ".jpg"
}

// HasRunStillPositions reports whether an instance's log has unit positions to replay.
func HasRunStillPositions(capabilities []string) bool {
	return slices.Contains(capabilities, runStillCapability)
}

// RunStill returns an instance's replay still, or storage.ErrFileNotFound before it is rendered.
func (c *Chronicle) RunStill(ctx context.Context, instanceID uuid.UUID) ([]byte, error) {
	return c.Storage.DownloadFile(ctx, BucketRaidLogs, runStillKey(instanceID))
}

// EnqueueRunStill asks for an instance's still to be rendered; a no-op when stills are disabled.
func (c *Chronicle) EnqueueRunStill(ctx context.Context, instanceID uuid.UUID) error {
	if c.queue == nil || !c.RunStillsEnabled() {
		return nil
	}
	_, err := c.queue.Insert(ctx, ArgsRenderRunStill{InstanceID: instanceID}, nil)
	return err
}

type WorkerRenderRunStill struct {
	river.WorkerDefaults[ArgsRenderRunStill]
	parent *Chronicle
}

func (c *Chronicle) NewWorkerRenderRunStill() *WorkerRenderRunStill {
	return &WorkerRenderRunStill{parent: c}
}

func (*WorkerRenderRunStill) Timeout(*river.Job[ArgsRenderRunStill]) time.Duration {
	return 3 * time.Minute
}

func (w *WorkerRenderRunStill) Work(ctx context.Context, job *river.Job[ArgsRenderRunStill]) error {
	c := w.parent
	if !c.RunStillsEnabled() {
		return nil
	}

	inst, err := c.Zed.PublicInstance(ctx, job.Args.InstanceID)
	if err != nil {
		// Deleted or unlisted since it was queued: nothing to show.
		c.logger.InfoContext(ctx, "skip run still", slog.String("instance_id", job.Args.InstanceID.String()), slog.Any("error", err))
		return nil
	}
	if !HasRunStillPositions(inst.Capabilities) {
		return nil
	}
	if _, err := c.RunStill(ctx, inst.ID); err == nil {
		return nil
	} else if !errors.Is(err, storage.ErrFileNotFound) {
		return fmt.Errorf("check existing still: %w", err)
	}

	pageURL, err := runStillPageURL(c.runStill.BaseURL, inst.TenantSlug.String, c.primaryDomain, inst.ID)
	if err != nil {
		return err
	}
	start := time.Now()
	jpg, err := renderRunStill(ctx, c.runStill.ChromePath, pageURL)
	if err != nil {
		return fmt.Errorf("render still: %w", err)
	}

	cacheControl := "public, max-age=86400"
	contentType := "image/jpeg"
	if _, err := c.Storage.UploadFile(ctx, BucketRaidLogs, runStillKey(inst.ID), bytes.NewReader(jpg), storage.FileOptions{
		ContentType:  &contentType,
		CacheControl: &cacheControl,
	}); err != nil {
		return fmt.Errorf("store still: %w", err)
	}
	c.logger.InfoContext(ctx, "rendered run still",
		slog.String("instance_id", inst.ID.String()),
		slog.Int("bytes", len(jpg)),
		slog.Duration("duration", time.Since(start)),
	)
	return nil
}

// runStillPageURL is the still page on the instance's own site (a tenant's subdomain, like its OG URL).
func runStillPageURL(baseURL, tenantSlug, primaryDomain string, instanceID uuid.UUID) (string, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("parse still base url: %w", err)
	}
	if tenantSlug != "" && primaryDomain != "" {
		u.Host = tenantSlug + "." + primaryDomain
	}
	u.Path = "/render/run-still/" + instanceID.String()
	u.RawQuery = ""
	return u.String(), nil
}

// renderRunStill opens the still page in headless Chrome, waits for it to report
// the replay on screen (window.__runStillReady), and screenshots it as a JPG.
func renderRunStill(ctx context.Context, chromePath, pageURL string) ([]byte, error) {
	allocOpts := append(slices.Clone(chromedp.DefaultExecAllocatorOptions[:]),
		chromedp.ExecPath(chromePath),
		chromedp.WindowSize(RunStillWidth, RunStillHeight),
		// No GPU in the container: WebGL through SwiftShader.
		chromedp.Flag("use-angle", "swiftshader"),
		chromedp.Flag("enable-unsafe-swiftshader", true),
		chromedp.Flag("ignore-gpu-blocklist", true),
		chromedp.NoSandbox,
	)
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, allocOpts...)
	defer cancelAlloc()
	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	var ready bool
	var jpg []byte
	err := chromedp.Run(browserCtx,
		chromedp.EmulateViewport(RunStillWidth, RunStillHeight),
		chromedp.Navigate(pageURL),
		chromedp.ActionFunc(func(ctx context.Context) error {
			ctx, cancel := context.WithTimeout(ctx, runStillReadyTimeout)
			defer cancel()
			return chromedp.Poll(`window.__runStillReady === true || window.__runStillReady === "failed"`, nil,
				chromedp.WithPollingInterval(500*time.Millisecond)).Do(ctx)
		}),
		chromedp.Evaluate(`window.__runStillReady === true`, &ready),
		chromedp.ActionFunc(func(ctx context.Context) error {
			if !ready {
				return errors.New("still page could not show the replay")
			}
			return nil
		}),
		chromedp.Sleep(runStillSettle),
		chromedp.FullScreenshot(&jpg, 82),
	)
	if err != nil {
		return nil, err
	}
	return jpg, nil
}
