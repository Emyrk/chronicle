// Package openrouter implements the OpenRouter inference provider.
package openrouter

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"

	serviceinference "github.com/Emyrk/chronicle/internal/services/serviceinference/contracts"
)

const (
	ProviderID                  = serviceinference.ProviderID("openrouter")
	DefaultBaseURL              = "https://openrouter.ai/api/v1"
	DefaultAuthorizationBaseURL = "https://openrouter.ai/auth"
	maxErrorBodyBytes           = 8 << 10
	maxSSEEventBytes            = 2 << 20
)

var sensitiveTokenPattern = regexp.MustCompile(`(?i)(bearer\s+|(?:sk|key)-)[A-Za-z0-9._~+/=-]{8,}`)

type Config struct {
	BaseURL            string
	AuthorizationURL   string
	HTTPClient         *http.Client
	AttributionReferer string
	AttributionTitle   string
}

type Client struct {
	baseURL          *url.URL
	authorizationURL *url.URL
	httpClient       *http.Client
	referer          string
	title            string
}

var _ serviceinference.Provider = (*Client)(nil)

func New(config Config) (*Client, error) {
	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	authorizationURL := config.AuthorizationURL
	if authorizationURL == "" {
		authorizationURL = DefaultAuthorizationBaseURL
	}
	parsedBaseURL, err := parseBaseURL(baseURL)
	if err != nil {
		return nil, fmt.Errorf("parse OpenRouter base URL: %w", err)
	}
	parsedAuthorizationURL, err := parseBaseURL(authorizationURL)
	if err != nil {
		return nil, fmt.Errorf("parse OpenRouter authorization URL: %w", err)
	}
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 2 * time.Minute}
	}
	return &Client{
		baseURL:          parsedBaseURL,
		authorizationURL: parsedAuthorizationURL,
		httpClient:       httpClient,
		referer:          strings.TrimSpace(config.AttributionReferer),
		title:            strings.TrimSpace(config.AttributionTitle),
	}, nil
}

func parseBaseURL(rawURL string) (*url.URL, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("URL scheme must be http or https")
	}
	if parsed.Host == "" {
		return nil, errors.New("URL host is required")
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	return parsed, nil
}

func (c *Client) ID() serviceinference.ProviderID { return ProviderID }

func (c *Client) ListModels(ctx context.Context, credential []byte) ([]serviceinference.ModelDescriptor, error) {
	request, err := c.newRequest(ctx, http.MethodGet, "models", credential, nil)
	if err != nil {
		return nil, err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("list OpenRouter models: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, responseError("list OpenRouter models", response, credential)
	}
	var payload modelsResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, 16<<20)).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode OpenRouter models: %w", err)
	}
	models := make([]serviceinference.ModelDescriptor, 0, len(payload.Data))
	for _, model := range payload.Data {
		models = append(models, serviceinference.ModelDescriptor{
			ID:            model.ID,
			Name:          model.Name,
			Description:   model.Description,
			ContextLength: model.ContextLength,
			Capabilities: serviceinference.ModelCapabilities{
				Streaming: true,
				Tools:     slices.Contains(model.SupportedParameters, "tools"),
			},
		})
	}
	return models, nil
}

func (c *Client) StreamChat(ctx context.Context, credential []byte, request serviceinference.ChatRequest, callback serviceinference.StreamCallback) error {
	if callback == nil {
		return errors.New("OpenRouter stream callback is required")
	}
	payload := chatRequest{
		Model:         request.Model,
		Messages:      make([]chatMessage, 0, len(request.Messages)),
		Stream:        true,
		StreamOptions: &streamOptions{IncludeUsage: true},
		Temperature:   request.Temperature,
		MaxTokens:     request.MaxTokens,
	}
	for _, message := range request.Messages {
		converted := chatMessage{
			Role:       string(message.Role),
			Name:       message.Name,
			Content:    message.Content,
			ToolCallID: message.ToolCallID,
		}
		for _, toolCall := range message.ToolCalls {
			converted.ToolCalls = append(converted.ToolCalls, chatToolCall{
				ID:   toolCall.ID,
				Type: "function",
				Function: chatFunctionCall{
					Name:      toolCall.Name,
					Arguments: toolCall.Arguments,
				},
			})
		}
		payload.Messages = append(payload.Messages, converted)
	}
	for _, tool := range request.Tools {
		payload.Tools = append(payload.Tools, chatTool{
			Type: "function",
			Function: chatFunctionDefinition{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  tool.Parameters,
			},
		})
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode OpenRouter chat request: %w", err)
	}
	httpRequest, err := c.newRequest(ctx, http.MethodPost, "chat/completions", credential, bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Accept", "text/event-stream")
	response, err := c.httpClient.Do(httpRequest)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("stream OpenRouter chat: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return responseError("stream OpenRouter chat", response, credential)
	}
	if err := parseSSE(response.Body, callback); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("stream OpenRouter chat: %w", err)
	}
	return nil
}

// PKCEChallenge returns the base64url-encoded S256 challenge for verifier.
func PKCEChallenge(verifier string) string {
	digest := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(digest[:])
}

// AuthorizationURL builds OpenRouter's PKCE authorization URL.
func (c *Client) AuthorizationURL(callbackURL, codeChallenge string) (string, error) {
	if strings.TrimSpace(callbackURL) == "" {
		return "", errors.New("OpenRouter OAuth callback URL is required")
	}
	if strings.TrimSpace(codeChallenge) == "" {
		return "", errors.New("OpenRouter OAuth code challenge is required")
	}
	result := *c.authorizationURL
	query := result.Query()
	query.Set("callback_url", callbackURL)
	query.Set("code_challenge", codeChallenge)
	query.Set("code_challenge_method", "S256")
	result.RawQuery = query.Encode()
	return result.String(), nil
}

// OAuthKey is the credential returned by OpenRouter's code exchange.
type OAuthKey struct {
	Key string
}

// ExchangeAuthorizationCode exchanges an authorization code and PKCE verifier
// for an OpenRouter API key. It does not persist either value.
func (c *Client) ExchangeAuthorizationCode(ctx context.Context, code, codeVerifier string) (OAuthKey, error) {
	if code == "" || codeVerifier == "" {
		return OAuthKey{}, errors.New("OpenRouter OAuth code and verifier are required")
	}
	body, err := json.Marshal(exchangeRequest{
		Code:                code,
		CodeVerifier:        codeVerifier,
		CodeChallengeMethod: "S256",
	})
	if err != nil {
		return OAuthKey{}, fmt.Errorf("encode OpenRouter OAuth exchange: %w", err)
	}
	request, err := c.newRequest(ctx, http.MethodPost, "auth/keys", nil, bytes.NewReader(body))
	if err != nil {
		return OAuthKey{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return OAuthKey{}, fmt.Errorf("exchange OpenRouter OAuth code: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return OAuthKey{}, responseError("exchange OpenRouter OAuth code", response, []byte(code), []byte(codeVerifier))
	}
	var payload exchangeResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err != nil {
		return OAuthKey{}, fmt.Errorf("decode OpenRouter OAuth exchange: %w", err)
	}
	if payload.Key == "" {
		return OAuthKey{}, errors.New("OpenRouter OAuth exchange returned an empty key")
	}
	return OAuthKey(payload), nil
}

func (c *Client) newRequest(ctx context.Context, method, path string, credential []byte, body io.Reader) (*http.Request, error) {
	endpoint := *c.baseURL
	endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/" + strings.TrimLeft(path, "/")
	request, err := http.NewRequestWithContext(ctx, method, endpoint.String(), body)
	if err != nil {
		return nil, fmt.Errorf("create OpenRouter request: %w", err)
	}
	if len(credential) > 0 {
		request.Header.Set("Authorization", "Bearer "+string(credential))
	}
	if c.referer != "" {
		request.Header.Set("HTTP-Referer", c.referer)
	}
	if c.title != "" {
		request.Header.Set("X-Title", c.title)
	}
	return request, nil
}

func parseSSE(reader io.Reader, callback serviceinference.StreamCallback) error {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64<<10), maxSSEEventBytes)
	var dataLines []string
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if line == "" {
			if done, err := processSSEData(dataLines, callback); err != nil {
				return err
			} else if done {
				return nil
			}
			dataLines = dataLines[:0]
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		field, value, found := strings.Cut(line, ":")
		if !found || field != "data" {
			continue
		}
		dataLines = append(dataLines, strings.TrimPrefix(value, " "))
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read SSE stream: %w", err)
	}
	_, err := processSSEData(dataLines, callback)
	return err
}

func processSSEData(dataLines []string, callback serviceinference.StreamCallback) (bool, error) {
	if len(dataLines) == 0 {
		return false, nil
	}
	data := strings.Join(dataLines, "\n")
	if strings.TrimSpace(data) == "[DONE]" {
		return true, nil
	}
	var chunk chatChunk
	if err := json.Unmarshal([]byte(data), &chunk); err != nil {
		return false, fmt.Errorf("decode SSE data: %w", err)
	}
	for _, choice := range chunk.Choices {
		if choice.Delta.Content != nil {
			if err := callback(serviceinference.StreamEvent{Type: serviceinference.StreamEventTextDelta, Text: *choice.Delta.Content}); err != nil {
				return false, err
			}
		}
		for _, toolCall := range choice.Delta.ToolCalls {
			if err := callback(serviceinference.StreamEvent{
				Type: serviceinference.StreamEventToolCallDelta,
				ToolCall: serviceinference.ToolCallDelta{
					Index:     toolCall.Index,
					ID:        toolCall.ID,
					Name:      toolCall.Function.Name,
					Arguments: toolCall.Function.Arguments,
				},
			}); err != nil {
				return false, err
			}
		}
		if choice.FinishReason != nil {
			if err := callback(serviceinference.StreamEvent{
				Type:         serviceinference.StreamEventFinish,
				FinishReason: normalizeFinishReason(*choice.FinishReason),
			}); err != nil {
				return false, err
			}
		}
	}
	if chunk.Usage != nil {
		if err := callback(serviceinference.StreamEvent{
			Type: serviceinference.StreamEventUsage,
			Usage: serviceinference.Usage{
				PromptTokens:     chunk.Usage.PromptTokens,
				CompletionTokens: chunk.Usage.CompletionTokens,
				TotalTokens:      chunk.Usage.TotalTokens,
			},
		}); err != nil {
			return false, err
		}
	}
	return false, nil
}

func normalizeFinishReason(reason string) serviceinference.FinishReason {
	switch reason {
	case "stop":
		return serviceinference.FinishReasonStop
	case "length", "max_tokens":
		return serviceinference.FinishReasonLength
	case "tool_calls", "function_call":
		return serviceinference.FinishReasonToolCalls
	case "content_filter":
		return serviceinference.FinishReasonContentFilter
	default:
		return serviceinference.FinishReasonOther
	}
}

func responseError(operation string, response *http.Response, secrets ...[]byte) error {
	body, err := io.ReadAll(io.LimitReader(response.Body, maxErrorBodyBytes+1))
	if err != nil {
		return fmt.Errorf("%s: HTTP %d (read error response: %v)", operation, response.StatusCode, err)
	}
	truncated := len(body) > maxErrorBodyBytes
	if truncated {
		body = body[:maxErrorBodyBytes]
	}
	message := strings.TrimSpace(string(body))
	for _, secret := range secrets {
		if len(secret) > 0 {
			message = strings.ReplaceAll(message, string(secret), "[REDACTED]")
		}
	}
	message = sensitiveTokenPattern.ReplaceAllStringFunc(message, func(match string) string {
		if prefix, _, ok := strings.Cut(match, " "); ok {
			return prefix + " [REDACTED]"
		}
		return "[REDACTED]"
	})
	if truncated {
		message += "..."
	}
	if message == "" {
		return fmt.Errorf("%s: HTTP %d", operation, response.StatusCode)
	}
	return fmt.Errorf("%s: HTTP %d: %s", operation, response.StatusCode, message)
}

type modelsResponse struct {
	Data []model `json:"data"`
}

type model struct {
	ID                  string   `json:"id"`
	Name                string   `json:"name"`
	Description         string   `json:"description"`
	ContextLength       int      `json:"context_length"`
	SupportedParameters []string `json:"supported_parameters"`
}

type chatRequest struct {
	Model         string         `json:"model"`
	Messages      []chatMessage  `json:"messages"`
	Tools         []chatTool     `json:"tools,omitempty"`
	Stream        bool           `json:"stream"`
	StreamOptions *streamOptions `json:"stream_options,omitempty"`
	Temperature   *float64       `json:"temperature,omitempty"`
	MaxTokens     *int           `json:"max_tokens,omitempty"`
}

type streamOptions struct {
	IncludeUsage bool `json:"include_usage"`
}

type chatMessage struct {
	Role       string         `json:"role"`
	Name       string         `json:"name,omitempty"`
	Content    string         `json:"content,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
	ToolCalls  []chatToolCall `json:"tool_calls,omitempty"`
}

type chatTool struct {
	Type     string                 `json:"type"`
	Function chatFunctionDefinition `json:"function"`
}

type chatFunctionDefinition struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters"`
}

type chatToolCall struct {
	Index    int              `json:"index,omitempty"`
	ID       string           `json:"id,omitempty"`
	Type     string           `json:"type,omitempty"`
	Function chatFunctionCall `json:"function"`
}

type chatFunctionCall struct {
	Name      string `json:"name,omitempty"`
	Arguments string `json:"arguments,omitempty"`
}

type chatChunk struct {
	Choices []struct {
		Delta struct {
			Content   *string        `json:"content"`
			ToolCalls []chatToolCall `json:"tool_calls"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Usage *usage `json:"usage"`
}

type usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type exchangeRequest struct {
	Code                string `json:"code"`
	CodeVerifier        string `json:"code_verifier"`
	CodeChallengeMethod string `json:"code_challenge_method"`
}

type exchangeResponse struct {
	Key string `json:"key"`
}
