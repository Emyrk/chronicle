package chroniclebot

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/prometheus/client_golang/prometheus"
)

const discordRequestSourceUnattributed = "unattributed"

type discordRequestSourceKey struct{}

type discordHTTPMetrics struct {
	base     http.RoundTripper
	requests *prometheus.CounterVec
	duration *prometheus.HistogramVec
}

func newDiscordHTTPMetrics(base http.RoundTripper, registerer prometheus.Registerer) (*discordHTTPMetrics, error) {
	if base == nil {
		base = http.DefaultTransport
	}
	metrics := &discordHTTPMetrics{
		base: base,
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "discord_http",
			Name:      "requests_total",
			Help:      "Discord HTTP requests by logical source, method, and response status.",
		}, []string{"source", "method", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "discord_http",
			Name:      "request_duration_seconds",
			Help:      "Discord HTTP request duration by logical source, method, and response status.",
			Buckets:   prometheus.DefBuckets,
		}, []string{"source", "method", "status"}),
	}
	if err := registerer.Register(metrics.requests); err != nil {
		return nil, fmt.Errorf("register Discord HTTP request counter: %w", err)
	}
	if err := registerer.Register(metrics.duration); err != nil {
		return nil, fmt.Errorf("register Discord HTTP request duration: %w", err)
	}
	return metrics, nil
}

func (m *discordHTTPMetrics) RoundTrip(req *http.Request) (*http.Response, error) {
	started := time.Now()
	resp, err := m.base.RoundTrip(req)
	status := "error"
	if resp != nil {
		status = strconv.Itoa(resp.StatusCode)
	}
	labels := []string{discordRequestSource(req), req.Method, status}
	m.requests.WithLabelValues(labels...).Inc()
	m.duration.WithLabelValues(labels...).Observe(time.Since(started).Seconds())
	return resp, err
}

func discordRequestSource(req *http.Request) string {
	if source, ok := req.Context().Value(discordRequestSourceKey{}).(string); ok && source != "" {
		return source
	}
	if strings.HasSuffix(req.URL.EscapedPath(), "/gateway") {
		return "gateway"
	}
	return discordRequestSourceUnattributed
}

type discordSourceTransport struct {
	base   http.RoundTripper
	source string
}

func (t discordSourceTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	ctx := context.WithValue(req.Context(), discordRequestSourceKey{}, t.source)
	return t.base.RoundTrip(req.WithContext(ctx))
}

// DiscordHTTPClient returns a client whose requests are attributed to source.
func (b *Bot) DiscordHTTPClient(source string) *http.Client {
	if b == nil || b.session == nil || b.session.Client == nil {
		return http.DefaultClient
	}
	client := *b.session.Client
	base := client.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	client.Transport = discordSourceTransport{base: base, source: source}
	return &client
}

func discordRequestOption(ctx context.Context, source string) discordgo.RequestOption {
	if ctx == nil {
		ctx = context.Background()
	}
	return discordgo.WithContext(context.WithValue(ctx, discordRequestSourceKey{}, source))
}
