package openrouter

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/internal/services/serviceinference"
	"github.com/stretchr/testify/require"
)

func TestAuthorizationURLAndPKCE(t *testing.T) {
	t.Parallel()

	client, err := New(Config{})
	require.NoError(t, err)
	challenge := PKCEChallenge("verifier")
	result, err := client.AuthorizationURL("https://chronicle.example/callback?tenant=turtle", challenge)
	require.NoError(t, err)

	parsed, err := url.Parse(result)
	require.NoError(t, err)
	require.Equal(t, "https://openrouter.ai/auth", parsed.Scheme+"://"+parsed.Host+parsed.Path)
	require.Equal(t, "https://chronicle.example/callback?tenant=turtle", parsed.Query().Get("callback_url"))
	require.Equal(t, challenge, parsed.Query().Get("code_challenge"))
	require.Equal(t, "S256", parsed.Query().Get("code_challenge_method"))
}

func TestExchangeAuthorizationCode(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/v1/auth/keys", r.URL.Path)
		require.Equal(t, http.MethodPost, r.Method)
		var request exchangeRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		require.Equal(t, "authorization-code", request.Code)
		require.Equal(t, "verifier", request.CodeVerifier)
		require.Equal(t, "S256", request.CodeChallengeMethod)
		_ = json.NewEncoder(w).Encode(exchangeResponse{Key: "oauth-key"})
	}))
	defer server.Close()

	client := newTestClient(t, server)
	key, err := client.ExchangeAuthorizationCode(context.Background(), "authorization-code", "verifier")
	require.NoError(t, err)
	require.Equal(t, "oauth-key", key.Key)
}

func TestListModels(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/v1/models", r.URL.Path)
		require.Equal(t, "Bearer credential", r.Header.Get("Authorization"))
		require.Equal(t, "https://chronicle.example", r.Header.Get("HTTP-Referer"))
		require.Equal(t, "Chronicle", r.Header.Get("X-Title"))
		_, _ = fmt.Fprint(w, `{"data":[{"id":"tools/model","name":"Tool Model","description":"supports tools","context_length":128000,"supported_parameters":["tools","temperature"]},{"id":"text/model","name":"Text Model","context_length":4096,"supported_parameters":["temperature"]}]}`)
	}))
	defer server.Close()

	client := newTestClient(t, server)
	models, err := client.ListModels(context.Background(), []byte("credential"))
	require.NoError(t, err)
	require.Len(t, models, 2)
	require.True(t, models[0].Capabilities.Tools)
	require.True(t, models[0].Capabilities.Streaming)
	require.False(t, models[1].Capabilities.Tools)
}

func TestStreamChatTextAndUsage(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/v1/chat/completions", r.URL.Path)
		var request chatRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		require.True(t, request.Stream)
		require.NotNil(t, request.StreamOptions)
		require.True(t, request.StreamOptions.IncludeUsage)
		require.Equal(t, "model", request.Model)
		require.Equal(t, "hello", request.Messages[0].Content)
		require.Equal(t, "lookup", request.Tools[0].Function.Name)
		require.JSONEq(t, `{"type":"object"}`, string(request.Tools[0].Function.Parameters))

		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(w, ": keep-alive\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"Hello\\n\"},\"finish_reason\":null}]}\n\n")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"world\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2,\"total_tokens\":5}}\n\n")
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := newTestClient(t, server)
	var events []serviceinference.StreamEvent
	err := client.StreamChat(context.Background(), []byte("credential"), serviceinference.ChatRequest{
		Model:    "model",
		Messages: []serviceinference.Message{{Role: serviceinference.RoleUser, Content: "hello"}},
		Tools: []serviceinference.ToolDefinition{{
			Name:       "lookup",
			Parameters: json.RawMessage(`{"type":"object"}`),
		}},
	}, func(event serviceinference.StreamEvent) error {
		events = append(events, event)
		return nil
	})
	require.NoError(t, err)
	require.Equal(t, []serviceinference.StreamEvent{
		{Type: serviceinference.StreamEventTextDelta, Text: "Hello\n"},
		{Type: serviceinference.StreamEventTextDelta, Text: "world"},
		{Type: serviceinference.StreamEventFinish, FinishReason: serviceinference.FinishReasonStop},
		{Type: serviceinference.StreamEventUsage, Usage: serviceinference.Usage{PromptTokens: 3, CompletionTokens: 2, TotalTokens: 5}},
	}, events)
}

func TestStreamChatToolCallDeltas(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"look\",\"arguments\":\"{\\\"id\\\":\"}}]},\"finish_reason\":null}]}\n\n")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"up\",\"arguments\":\"42}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n")
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := newTestClient(t, server)
	var events []serviceinference.StreamEvent
	err := client.StreamChat(context.Background(), []byte("credential"), serviceinference.ChatRequest{Model: "model"}, func(event serviceinference.StreamEvent) error {
		events = append(events, event)
		return nil
	})
	require.NoError(t, err)
	require.Equal(t, []serviceinference.StreamEvent{
		{Type: serviceinference.StreamEventToolCallDelta, ToolCall: serviceinference.ToolCallDelta{Index: 0, ID: "call_1", Name: "look", Arguments: `{"id":`}},
		{Type: serviceinference.StreamEventToolCallDelta, ToolCall: serviceinference.ToolCallDelta{Index: 0, Name: "up", Arguments: `42}`}},
		{Type: serviceinference.StreamEventFinish, FinishReason: serviceinference.FinishReasonToolCalls},
	}, events)
}

func TestStreamChatHTTPErrorRedactsCredential(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = fmt.Fprint(w, `bad credential secret-credential and Bearer provider-secret-value`)
	}))
	defer server.Close()

	client := newTestClient(t, server)
	err := client.StreamChat(context.Background(), []byte("secret-credential"), serviceinference.ChatRequest{Model: "model"}, func(serviceinference.StreamEvent) error { return nil })
	require.Error(t, err)
	require.ErrorContains(t, err, "HTTP 401")
	require.NotContains(t, err.Error(), "secret-credential")
	require.NotContains(t, err.Error(), "provider-secret-value")
	require.Contains(t, err.Error(), "[REDACTED]")
}

func TestStreamChatCancellation(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher, ok := w.(http.Flusher)
		require.True(t, ok)
		flusher.Flush()
		close(started)
		<-r.Context().Done()
	}))
	defer server.Close()

	client := newTestClient(t, server)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- client.StreamChat(ctx, []byte("credential"), serviceinference.ChatRequest{Model: "model"}, func(serviceinference.StreamEvent) error { return nil })
	}()
	<-started
	cancel()
	require.ErrorIs(t, <-done, context.Canceled)
}

func TestStreamCallbackErrorStopsParsing(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n")
	}))
	defer server.Close()

	client := newTestClient(t, server)
	sentinel := errors.New("stop")
	err := client.StreamChat(context.Background(), nil, serviceinference.ChatRequest{Model: "model"}, func(serviceinference.StreamEvent) error {
		return sentinel
	})
	require.ErrorIs(t, err, sentinel)
}

func newTestClient(t *testing.T, server *httptest.Server) *Client {
	t.Helper()
	client, err := New(Config{
		BaseURL:            server.URL + "/api/v1",
		AuthorizationURL:   server.URL + "/auth",
		HTTPClient:         server.Client(),
		AttributionReferer: "https://chronicle.example",
		AttributionTitle:   "Chronicle",
	})
	require.NoError(t, err)
	return client
}

func TestResponseErrorIsBounded(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = fmt.Fprint(w, strings.Repeat("x", maxErrorBodyBytes*2))
	}))
	defer server.Close()

	client := newTestClient(t, server)
	_, err := client.ListModels(context.Background(), nil)
	require.Error(t, err)
	require.Less(t, len(err.Error()), maxErrorBodyBytes+100)
	require.True(t, strings.HasSuffix(err.Error(), "..."))
}
