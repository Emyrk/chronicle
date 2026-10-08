package chroniclebot

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"

	"github.com/bwmarrin/discordgo"
	"github.com/stretchr/testify/require"
)

type fakeGateway struct {
	mu         sync.Mutex
	openCalls  int
	closeCalls int
	closeErr   error
}

func (g *fakeGateway) Open() error {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.openCalls++
	return nil
}

func (g *fakeGateway) Close() error {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.closeCalls++
	return g.closeErr
}

func (g *fakeGateway) calls() (int, int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.openCalls, g.closeCalls
}

func testBot(t *testing.T) (*Bot, *fakeGateway) {
	t.Helper()
	session, err := discordgo.New("Bot test-token")
	require.NoError(t, err)
	gateway := &fakeGateway{}
	httpDiagnostics := newDiscordHTTPDiagnostics(session.Client.Transport, "test-token")
	bot := &Bot{
		session:         session,
		gateway:         gateway,
		httpDiagnostics: httpDiagnostics,
		logger:          slog.New(slog.NewTextHandler(io.Discard, nil)),
		commandHandlers: make(map[string]func(*discordgo.Session, *discordgo.InteractionCreate)),
	}
	bot.installHandlers()
	return bot, gateway
}

func TestNewDoesNotStartGateway(t *testing.T) {
	t.Parallel()

	bot, err := New(t.Context(), slog.New(slog.NewTextHandler(io.Discard, nil)), Config{Token: "test-token"})
	require.NoError(t, err)
	require.True(t, bot.Available())
	require.False(t, bot.GatewayRunning())
	require.NotNil(t, bot.Session())
	require.False(t, bot.Session().DataReady)
	require.NoError(t, bot.Close())
}

func TestGatewayLifecycleIsIdempotentAndRestartable(t *testing.T) {
	t.Parallel()

	bot, gateway := testBot(t)
	ctx := context.Background()

	require.NoError(t, bot.StartGateway(ctx))
	require.NoError(t, bot.StartGateway(ctx))
	require.True(t, bot.GatewayRunning())
	openCalls, closeCalls := gateway.calls()
	require.Equal(t, 1, openCalls)
	require.Zero(t, closeCalls)

	require.NoError(t, bot.StopGateway())
	require.NoError(t, bot.StopGateway())
	require.False(t, bot.GatewayRunning())
	openCalls, closeCalls = gateway.calls()
	require.Equal(t, 1, openCalls)
	require.Equal(t, 1, closeCalls)

	require.NoError(t, bot.StartGateway(ctx))
	require.NoError(t, bot.StopGateway())
	openCalls, closeCalls = gateway.calls()
	require.Equal(t, 2, openCalls)
	require.Equal(t, 2, closeCalls)
}

func TestStopGatewayFailureKeepsGatewayRunning(t *testing.T) {
	t.Parallel()

	bot, gateway := testBot(t)
	require.NoError(t, bot.StartGateway(t.Context()))

	gateway.closeErr = errors.New("close failed")
	require.Error(t, bot.StopGateway())
	require.True(t, bot.GatewayRunning())

	gateway.closeErr = nil
	require.NoError(t, bot.StopGateway())
	require.False(t, bot.GatewayRunning())
}

func TestInstallHandlersIsIdempotent(t *testing.T) {
	t.Parallel()

	bot, _ := testBot(t)
	initialHandlers := len(bot.handlers)
	require.NotZero(t, initialHandlers)

	bot.installHandlers()
	bot.installHandlers()
	require.Len(t, bot.handlers, initialHandlers)
}

func TestDisabledBotGatewayLifecycleIsNoop(t *testing.T) {
	t.Parallel()

	bot := &Bot{disabled: true, logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	require.NoError(t, bot.StartGateway(context.Background()))
	require.NoError(t, bot.StopGateway())
	require.NoError(t, bot.Close())
	require.False(t, bot.GatewayRunning())
}
