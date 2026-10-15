package main

import (
	"bytes"
	"image/color"
	"image/png"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
)

func TestTrayIconStateDot(t *testing.T) {
	t.Parallel()
	states := []engine.State{engine.StateIdle, engine.StateNoLog, engine.StateWaiting,
		engine.StateRecording, engine.StateUploading, engine.StateUploaded, engine.StateReconnect}
	for _, s := range states {
		want, ok := stateColors[s]
		require.True(t, ok, "state %v has no colour", s)
		require.NotEmpty(t, trayIcon(s), "state %v", s)
		for _, i := range buildIcons(s, false) {
			img, err := png.Decode(bytes.NewReader(i.data))
			require.NoError(t, err)
			c := i.size * 28 / 36 // dot centre
			got := color.NRGBAModel.Convert(img.At(c, c)).(color.NRGBA)
			require.Equal(t, want, got, "state %v size %d", s, i.size)
		}
	}
}
