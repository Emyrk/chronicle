package servicechronicle

import (
	"testing"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/stretchr/testify/require"
)

func TestParseProcessRoles(t *testing.T) {
	t.Parallel()

	broker := services.New()
	require.Equal(t, chronicle.ParseProcessRoleServer, New(broker).parseProcessRole)
	require.Equal(t, chronicle.ParseProcessRoleParser, NewParser(broker).parseProcessRole)
}
