// Package pair implements the client side of Chronicle's device pairing: the
// uploader asks the server for a code, the user approves it in a browser, and
// the uploader exchanges it for a per-device upload token.
package pair

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
)

// Outcome is how a pairing ended.
type Outcome int

const (
	// Approved: Token is set.
	Approved Outcome = iota
	Denied
	Expired
)

// ErrUnauthorized means the device token was rejected.
var ErrUnauthorized = errors.New("device token rejected")

// Client talks to one Chronicle server.
type Client struct {
	// BaseURL is the Chronicle site, e.g. https://chronicleclassic.com.
	BaseURL string
	HTTP    *http.Client
	// Sleep waits between polls; tests override it.
	Sleep func(ctx context.Context, d time.Duration) error
}

// Start begins a pairing.
func (c *Client) Start(ctx context.Context, deviceName string) (chroniclesdk.DevicePairStartResponse, error) {
	var out chroniclesdk.DevicePairStartResponse
	err := c.do(ctx, http.MethodPost, "/api/v1/devices/pair/start", "",
		chroniclesdk.DevicePairStartRequest{DeviceName: deviceName}, &out)
	if err == nil && (out.DeviceCode == "" || out.VerifyURL == "") {
		err = errors.New("server sent an incomplete pairing response")
	}
	return out, err
}

// Wait polls until the pairing is resolved or ctx is done. The token is only
// returned on Approved. Transient failures are retried until the pairing
// expires.
func (c *Client) Wait(ctx context.Context, s chroniclesdk.DevicePairStartResponse) (Outcome, string, error) {
	interval := time.Duration(s.Interval) * time.Second
	if interval < time.Second {
		interval = time.Second
	}
	ttl := time.Duration(s.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	deadline := time.Now().Add(ttl + interval)
	sleep := c.Sleep
	if sleep == nil {
		sleep = sleepCtx
	}
	for {
		if err := sleep(ctx, interval); err != nil {
			return Expired, "", err
		}
		var out chroniclesdk.DevicePairPollResponse
		err := c.do(ctx, http.MethodPost, "/api/v1/devices/pair/poll", "",
			chroniclesdk.DevicePairPollRequest{DeviceCode: s.DeviceCode}, &out)
		if err == nil {
			switch out.Status {
			case chroniclesdk.DevicePairStatusOK:
				if out.Token == "" {
					return Expired, "", errors.New("server approved without a token")
				}
				return Approved, out.Token, nil
			case chroniclesdk.DevicePairStatusDenied:
				return Denied, "", nil
			case chroniclesdk.DevicePairStatusExpired:
				return Expired, "", nil
			}
		} else if ctx.Err() != nil {
			return Expired, "", ctx.Err()
		}
		if time.Now().After(deadline) {
			return Expired, "", nil
		}
	}
}

// WhoAmI returns the device name the server has for token.
func (c *Client) WhoAmI(ctx context.Context, token string) (string, error) {
	var out chroniclesdk.DeviceWhoAmIResponse
	if err := c.do(ctx, http.MethodGet, "/api/v1/whoami/device", token, nil, &out); err != nil {
		return "", err
	}
	return out.DeviceName, nil
}

// do sends a JSON request. The token only ever goes in the Authorization
// header and never into an error.
func (c *Client) do(ctx context.Context, method, path, token string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, body)
	if err != nil {
		return err
	}
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	httpc := c.HTTP
	if httpc == nil {
		httpc = &http.Client{Timeout: 30 * time.Second}
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	switch {
	case resp.StatusCode == http.StatusUnauthorized:
		return ErrUnauthorized
	case resp.StatusCode != http.StatusOK:
		return fmt.Errorf("%s %s: HTTP %d", method, path, resp.StatusCode)
	}
	return json.Unmarshal(b, out)
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
