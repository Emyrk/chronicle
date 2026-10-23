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

	serviceinference "github.com/Emyrk/chronicle/internal/services/serviceinference/contracts"
	"github.com/Emyrk/chronicle/internal/testutil"
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

	type observedRequest struct {
		path, method string
		request      exchangeRequest
		err          error
	}
	observed := make(chan observedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request exchangeRequest
		err := json.NewDecoder(r.Body).Decode(&request)
		observed <- observedRequest{path: r.URL.Path, method: r.Method, request: request, err: err}
		_ = json.NewEncoder(w).Encode(exchangeResponse{Key: "oauth-key"})
	}))
	defer server.Close()

	client := newTestClient(t, server)
	key, err := client.ExchangeAuthorizationCode(testutil.Context(t, testutil.WaitShort), "authorization-code", "verifier")
	require.NoError(t, err)
	request := <-observed
	require.NoError(t, request.err)
	require.Equal(t, "/api/v1/auth/keys", request.path)
	require.Equal(t, http.MethodPost, request.method)
	require.Equal(t, "authorization-code", request.request.Code)
	require.Equal(t, "verifier", request.request.CodeVerifier)
	require.Equal(t, "S256", request.request.CodeChallengeMethod)
	require.Equal(t, "oauth-key", key.Key)
}

func TestListModels(t *testing.T) {
	t.Parallel()

	type observedRequest struct {
		path, authorization, referer, title string
	}
	observed := make(chan observedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observed <- observedRequest{r.URL.Path, r.Header.Get("Authorization"), r.Header.Get("HTTP-Referer"), r.Header.Get("X-Title")}
		_, _ = fmt.Fprint(w, `{"data":[{"id":"tools/model","name":"Tool Model","description":"supports tools","context_length":128000,"supported_parameters":["tools","temperature"]},{"id":"text/model","name":"Text Model","context_length":4096,"supported_parameters":["temperature"]}]}`)
	}))
	defer server.Close()

	client := newTestClient(t, server)
	models, err := client.ListModels(testutil.Context(t, testutil.WaitShort), []byte("credential"))
	require.NoError(t, err)
	request := <-observed
	require.Equal(t, "/api/v1/models", request.path)
	require.Equal(t, "Bearer credential", request.authorization)
	require.Equal(t, "https://chronicle.example", request.referer)
	require.Equal(t, "Chronicle", request.title)
	require.Len(t, models, 2)
	require.True(t, models[0].Capabilities.Tools)
	require.True(t, models[0].Capabilities.Streaming)
	require.False(t, models[1].Capabilities.Tools)
}

func TestStreamChatTextAndUsage(t *testing.T) {
	t.Parallel()

	type observedRequest struct {
		path    string
		request chatRequest
		err     error
	}
	observed := make(chan observedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request chatRequest
		err := json.NewDecoder(r.Body).Decode(&request)
		observed <- observedRequest{path: r.URL.Path, request: request, err: err}

		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(w, ": keep-alive\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"Hello\\n\"},\"finish_reason\":null}]}\n\n")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"world\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2,\"total_tokens\":5}}\n\n")
		_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	client := newTestClient(t, server)
	var events []serviceinference.StreamEvent
	err := client.StreamChat(testutil.Context(t, testutil.WaitShort), []byte("credential"), serviceinference.ChatRequest{
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
	request := <-observed
	require.NoError(t, request.err)
	require.Equal(t, "/api/v1/chat/completions", request.path)
	require.True(t, request.request.Stream)
	require.NotNil(t, request.request.StreamOptions)
	require.True(t, request.request.StreamOptions.IncludeUsage)
	require.Equal(t, "model", request.request.Model)
	require.Equal(t, "hello", request.request.Messages[0].Content)
	require.Equal(t, "lookup", request.request.Tools[0].Function.Name)
	require.JSONEq(t, `{"type":"object"}`, string(request.request.Tools[0].Function.Parameters))
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
	err := client.StreamChat(testutil.Context(t, testutil.WaitShort), []byte("credential"), serviceinference.ChatRequest{Model: "model"}, func(event serviceinference.StreamEvent) error {
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
	err := client.StreamChat(testutil.Context(t, testutil.WaitShort), []byte("secret-credential"), serviceinference.ChatRequest{Model: "model"}, func(serviceinference.StreamEvent) error { return nil })
	require.Error(t, err)
	require.ErrorContains(t, err, "HTTP 401")
	require.NotContains(t, err.Error(), "secret-credential")
	require.NotContains(t, err.Error(), "provider-secret-value")
	require.Contains(t, err.Error(), "[REDACTED]")
}

func TestStreamChatRejectsUnexpectedContentTypeAndMissingFinish(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, contentType, body, want string
	}{
		{name: "content type", contentType: "application/json", body: `{"error":"bad"}`, want: "unexpected Content-Type"},
		{name: "missing finish", contentType: "text/event-stream", body: "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\ndata: [DONE]\n\n", want: "without a finish reason"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", tc.contentType)
				_, _ = fmt.Fprint(w, tc.body)
			}))
			defer server.Close()
			client := newTestClient(t, server)
			err := client.StreamChat(testutil.Context(t, testutil.WaitShort), nil, serviceinference.ChatRequest{Model: "model"}, func(serviceinference.StreamEvent) error { return nil })
			require.ErrorContains(t, err, tc.want)
		})
	}
}

func TestStreamChatCancellation(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		close(started)
		<-r.Context().Done()
	}))
	defer server.Close()

	client := newTestClient(t, server)
	testCtx := testutil.Context(t, testutil.WaitShort)
	ctx, cancel := context.WithCancel(testCtx)
	done := make(chan error, 1)
	go func() {
		done <- client.StreamChat(ctx, []byte("credential"), serviceinference.ChatRequest{Model: "model"}, func(serviceinference.StreamEvent) error { return nil })
	}()
	select {
	case <-started:
	case err := <-done:
		require.FailNow(t, "request finished before reaching test server", "error: %v", err)
	case <-testCtx.Done():
		require.FailNow(t, "request did not reach test server")
	}
	cancel()
	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled)
	case <-testCtx.Done():
		require.FailNow(t, "cancelled request did not finish")
	}
}

func TestStreamCallbackErrorStopsParsing(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n")
	}))
	defer server.Close()

	client := newTestClient(t, server)
	sentinel := errors.New("stop")
	err := client.StreamChat(testutil.Context(t, testutil.WaitShort), nil, serviceinference.ChatRequest{Model: "model"}, func(serviceinference.StreamEvent) error {
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
	_, err := client.ListModels(testutil.Context(t, testutil.WaitShort), nil)
	require.Error(t, err)
	require.Less(t, len(err.Error()), maxErrorBodyBytes+100)
	require.True(t, strings.HasSuffix(err.Error(), "..."))
}
