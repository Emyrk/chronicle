package period

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/stretchr/testify/require"
)

func TestPeriodMarshal(t *testing.T) {
	t.Parallel()

	msg := messages.Message(&messages.Damage{
		Amount: 10,
	})

	data, err := json.Marshal(msg)
	require.NoError(t, err)
	fmt.Println(string(data))
}
