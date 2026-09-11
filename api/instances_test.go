package api

import (
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAttendanceOnly(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		url  string
		want bool
	}{
		{name: "true", url: "/?attendance_only=true", want: true},
		{name: "one", url: "/?attendance_only=1", want: true},
		{name: "false", url: "/?attendance_only=false", want: false},
		{name: "missing", url: "/", want: false},
		{name: "invalid", url: "/?attendance_only=yes", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			r := httptest.NewRequest("GET", tt.url, nil)
			require.Equal(t, tt.want, attendanceOnly(r))
		})
	}
}
