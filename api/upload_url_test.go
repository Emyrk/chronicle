package api

import (
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestReportURL(t *testing.T) {
	t.Parallel()

	id := uuid.New()
	api := &API{}

	r := httptest.NewRequest("POST", "http://guild.example.com/api/upload", nil)
	require.Equal(t, "http://guild.example.com/logs/"+id.String(), api.reportURL(r, id))

	r.Header.Set("X-Forwarded-Proto", "https")
	require.Equal(t, "https://guild.example.com/logs/"+id.String(), api.reportURL(r, id))
}
