package chronauth

import (
	"context"

	"github.com/markbates/goth"
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
	config oauth2.Config
}

func withContextualTokenRefresh(provider goth.Provider, clientID, clientSecret, tokenURL string) goth.Provider {
	return &contextualRefreshProvider{
		Provider: provider,
		config: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint: oauth2.Endpoint{
				TokenURL: tokenURL,
			},
		},
	}
}

func authorizeSession(session goth.Session, provider goth.Provider, params goth.Params) (string, error) {
	if contextualProvider, ok := provider.(*contextualRefreshProvider); ok {
		provider = contextualProvider.Provider
	}
	return session.Authorize(provider, params)
}

func (p *contextualRefreshProvider) RefreshTokenContext(ctx context.Context, refreshToken string) (*oauth2.Token, error) {
	token := &oauth2.Token{RefreshToken: refreshToken}
	return p.config.TokenSource(ctx, token).Token()
}
