package serviceinference

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

type stubProvider struct{ id ProviderID }

func (p stubProvider) ID() ProviderID                                              { return p.id }
func (stubProvider) ListModels(context.Context, []byte) ([]ModelDescriptor, error) { return nil, nil }
func (stubProvider) StreamChat(context.Context, []byte, ChatRequest, StreamCallback) error {
	return nil
}

func TestRegistry(t *testing.T) {
	t.Parallel()

	registry := NewRegistry()
	require.NoError(t, registry.Register(stubProvider{id: "second"}))
	require.NoError(t, registry.Register(stubProvider{id: "first"}))
	require.Equal(t, []ProviderID{"first", "second"}, registry.IDs())

	provider, ok := registry.Provider("first")
	require.True(t, ok)
	require.Equal(t, ProviderID("first"), provider.ID())
	require.ErrorContains(t, registry.Register(stubProvider{id: "first"}), "already registered")
}

func TestRunRequestValidateHistoryKinds(t *testing.T) {
	t.Parallel()

	base := RunRequest{Assistant: AssistantRequest{ProviderID: "provider", Model: "model"}}

	ephemeral := base
	ephemeral.History = EphemeralHistory{}
	require.NoError(t, ephemeral.Validate())

	durable := base
	durable.History = DurableHistory{ThreadID: "thread"}
	require.NoError(t, durable.Validate())

	missingThread := base
	missingThread.History = DurableHistory{}
	require.ErrorContains(t, missingThread.Validate(), "thread ID")
}
