package chronauth

import (
	"context"
	"errors"
	"net/http"

	"github.com/markbates/goth"
	gothdiscord "github.com/markbates/goth/providers/discord"
	"golang.org/x/oauth2"
)

const discordTokenURL = "https://discord.com/api/oauth2/token"

type DiscordOAuth struct {
	ClientID     string
	ClientSecret string
}

type contextualTokenRefresher interface {
	RefreshTokenContext(context.Context, string) (*oauth2.Token, error)
}

type contextualRefreshProvider struct {
	goth.Provider
	config     oauth2.Config
	httpClient *http.Client
}

func withContextualTokenRefresh(provider goth.Provider, clientID, clientSecret, tokenURL string, httpClient *http.Client) goth.Provider {
	return &contextualRefreshProvider{
		Provider: provider,
		config: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint: oauth2.Endpoint{
				TokenURL: tokenURL,
			},
		},
		httpClient: httpClient,
	}
}

func authorizeSession(session goth.Session, provider goth.Provider, params goth.Params) (string, error) {
	if contextualProvider, ok := provider.(*contextualRefreshProvider); ok {
		if discordSession, ok := session.(*gothdiscord.Session); ok {
			ctx := context.Background()
			if contextualProvider.httpClient != nil {
				ctx = context.WithValue(ctx, oauth2.HTTPClient, contextualProvider.httpClient)
			}
			token, err := contextualProvider.config.Exchange(ctx, params.Get("code"))
			if err != nil {
				return "", err
			}
			if !token.Valid() {
				return "", errors.New("invalid token received from provider")
			}
			discordSession.AccessToken = token.AccessToken
			discordSession.RefreshToken = token.RefreshToken
			discordSession.ExpiresAt = token.Expiry
			return token.AccessToken, nil
		}
		provider = contextualProvider.Provider
	}
	return session.Authorize(provider, params)
}

func (p *contextualRefreshProvider) RefreshTokenContext(ctx context.Context, refreshToken string) (*oauth2.Token, error) {
	if p.httpClient != nil {
		ctx = context.WithValue(ctx, oauth2.HTTPClient, p.httpClient)
	}
	token := &oauth2.Token{RefreshToken: refreshToken}
	return p.config.TokenSource(ctx, token).Token()
}
