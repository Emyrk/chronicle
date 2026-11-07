package chroniclebot

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/bwmarrin/discordgo"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"
)

func TestDiscordHTTPMetricsLabelsLogicalSource(t *testing.T) {
	t.Parallel()

	metrics, err := newDiscordHTTPMetrics(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusTooManyRequests, Body: http.NoBody}, nil
	}), prometheus.NewRegistry())
	require.NoError(t, err)

	ctx := context.WithValue(context.Background(), discordRequestSourceKey{}, "membership_sync")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://discord.com/api/v9/guilds/guild", nil)
	require.NoError(t, err)

	_, err = metrics.RoundTrip(req)
	require.NoError(t, err)
	require.Equal(t, 1.0, discordCounterValue(t, metrics.requests.WithLabelValues("membership_sync", http.MethodGet, "429")))
}

func TestDiscordRequestOptionAttachesSource(t *testing.T) {
	t.Parallel()

	req, err := http.NewRequest(http.MethodGet, "https://discord.com/api/v9/guilds/guild", nil)
	require.NoError(t, err)
	cfg := discordgo.RequestConfig{Request: req}
	discordRequestOption(context.Background(), "guild_installation")(&cfg)
	require.Equal(t, "guild_installation", discordRequestSource(cfg.Request))
}

func TestDiscordHTTPClientAttachesSource(t *testing.T) {
	t.Parallel()

	bot, _ := testBot(t)
	var source string
	bot.session.Client.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		source = discordRequestSource(req)
		return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody}, nil
	})
	req, err := http.NewRequest(http.MethodPost, "https://discord.com/api/oauth2/token", nil)
	require.NoError(t, err)
	resp, err := bot.DiscordHTTPClient("oauth_token").Do(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	require.Equal(t, "oauth_token", source)
}

func TestDiscordHTTPMetricsInfersGatewayAndRecordsTransportErrors(t *testing.T) {
	t.Parallel()

	metrics, err := newDiscordHTTPMetrics(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("network unavailable")
	}), prometheus.NewRegistry())
	require.NoError(t, err)

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://discord.com/api/v9/gateway", nil)
	require.NoError(t, err)
	_, err = metrics.RoundTrip(req)
	require.Error(t, err)
	require.Equal(t, 1.0, discordCounterValue(t, metrics.requests.WithLabelValues("gateway", http.MethodGet, "error")))
}

func TestDiscordHTTPMetricsExposesBoundedLabels(t *testing.T) {
	t.Parallel()

	registry := prometheus.NewRegistry()
	metrics, err := newDiscordHTTPMetrics(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody}, nil
	}), registry)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost, "https://discord.com/api/v9/channels/123/messages", strings.NewReader("{}"))
	require.NoError(t, err)
	_, err = metrics.RoundTrip(req)
	require.NoError(t, err)

	families, err := registry.Gather()
	require.NoError(t, err)
	var requestFamily *dto.MetricFamily
	for _, family := range families {
		if family.GetName() == "chronicle_discord_http_requests_total" {
			requestFamily = family
			break
		}
	}
	require.NotNil(t, requestFamily)
	require.Len(t, requestFamily.Metric, 1)
	labels := make(map[string]string)
	for _, label := range requestFamily.Metric[0].Label {
		labels[label.GetName()] = label.GetValue()
	}
	require.Equal(t, map[string]string{"method": "POST", "source": "unattributed", "status": "200"}, labels)
}

func discordCounterValue(t *testing.T, counter prometheus.Counter) float64 {
	t.Helper()
	metric := &dto.Metric{}
	require.NoError(t, counter.Write(metric))
	return metric.GetCounter().GetValue()
}
