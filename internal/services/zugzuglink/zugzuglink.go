// Package zugzuglink implements the "zug-zug" external verification
// provider. A guild site (e.g. the Zug Zug guild's capycraft.org) verifies
// players via their Discord identity and exposes an HTTP API that returns
// the characters owned by a Discord user:
//
//	GET {base_url}/api/chronicle/discord/{discordID}
//	Authorization: Bearer {secret}
//
//	{"verified": true, "characters": [{"name": "Holycows", "level": 60, "guild": "Zug Zug"}]}
//
// Chronicle uses the response to link the verified characters to the
// requesting user's account.
package zugzuglink

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// Type is the external verification provider type implemented by this
// package.
const Type = "zug-zug"

// Source returns the link_source value for links created from the given
// provider URL, e.g. "zug-zug/https://ambershire.com". Different URLs get
// distinct sources so multiple zug-zug providers never collide.
func Source(baseURL string) string {
	return Type + "/" + strings.TrimRight(baseURL, "/")
}

// Response is the provider's verification payload for a Discord user.
type Response struct {
	Verified   bool        `json:"verified"`
	Characters []Character `json:"characters"`
}

// Character is a single verified character.
type Character struct {
	Name  string `json:"name"`
	Level int    `json:"level"`
	// Guild is the guild name, or empty when the provider returns `false`.
	Guild string `json:"guild"`
	// RealmKey is the provider's realm slug, e.g. "eversong-wilds" for the
	// realm named "Eversong Wilds".
	RealmKey string `json:"realmKey"`
	// GameID is the character's uint32 player GUID, or zero when the provider
	// omits it or returns an empty string or false.
	GameID guid.GUID `json:"gameId"`
}

// RealmName converts the provider's realm key ("eversong-wilds") into a
// realm name suitable for a case-insensitive lookup ("eversong wilds").
func (c Character) RealmName() string {
	return strings.ReplaceAll(c.RealmKey, "-", " ")
}

// UnmarshalJSON handles the provider's string-or-false quirks.
func (c *Character) UnmarshalJSON(data []byte) error {
	var raw struct {
		Name     string          `json:"name"`
		Level    int             `json:"level"`
		Guild    json.RawMessage `json:"guild"`
		RealmKey string          `json:"realmKey"`
		GameID   json.RawMessage `json:"gameId"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	c.Name = raw.Name
	c.Level = raw.Level
	c.RealmKey = raw.RealmKey
	c.Guild = ""
	c.GameID = 0
	if len(raw.Guild) > 0 && raw.Guild[0] == '"' {
		var g string
		if err := json.Unmarshal(raw.Guild, &g); err != nil {
			return err
		}
		c.Guild = g
	}

	gameID := strings.TrimSpace(string(raw.GameID))
	if gameID == "" || gameID == "false" || gameID == "null" {
		return nil
	}
	if gameID[0] == '"' {
		if err := json.Unmarshal(raw.GameID, &gameID); err != nil {
			return err
		}
	}
	if gameID == "" {
		return nil
	}
	value, err := strconv.ParseUint(gameID, 10, 32)
	if err != nil {
		return fmt.Errorf("parse gameId %q: %w", gameID, err)
	}
	c.GameID = guid.GUID(value)
	return nil
}

// Client fetches verification data from a zug-zug provider.
type Client struct {
	baseURL    string
	secret     string
	httpClient *http.Client
}

func New(baseURL, secret string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		secret:  secret,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// Source returns the link_source value for this client's provider URL.
func (c *Client) Source() string {
	return Source(c.baseURL)
}

// FetchByDiscordID requests the verified characters for a Discord user ID.
func (c *Client) FetchByDiscordID(ctx context.Context, discordID string) (Response, error) {
	url := fmt.Sprintf("%s/api/chronicle/discord/%s", c.baseURL, discordID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Response{}, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.secret)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Response{}, fmt.Errorf("request verification provider: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 300 {
		// Read a little of the body for diagnostics without trusting it.
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return Response{}, fmt.Errorf("verification provider returned status %d: %s", resp.StatusCode, string(body))
	}

	var out Response
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&out); err != nil {
		return Response{}, fmt.Errorf("decode verification response: %w", err)
	}
	return out, nil
}
