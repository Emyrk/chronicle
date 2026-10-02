package cli

import (
	"image"
	"image/color"
	"image/draw"
	"testing"
)

func TestCombineTalentBackgroundQuadrants(t *testing.T) {
	t.Parallel()

	colors := []color.NRGBA{
		{R: 255, A: 255},
		{G: 255, A: 255},
		{B: 255, A: 255},
		{R: 255, G: 255, A: 255},
	}
	bounds := []image.Rectangle{
		image.Rect(0, 0, 4, 3),
		image.Rect(0, 0, 2, 3),
		image.Rect(0, 0, 4, 2),
		image.Rect(0, 0, 2, 2),
	}
	quadrants := make([]image.Image, 0, len(bounds))
	for i, bounds := range bounds {
		img := image.NewNRGBA(bounds)
		draw.Draw(img, bounds, &image.Uniform{C: colors[i]}, image.Point{}, draw.Src)
		quadrants = append(quadrants, img)
	}

	combined, err := combineTalentBackgroundQuadrants(quadrants)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := combined.Bounds(), image.Rect(0, 0, 6, 5); got != want {
		t.Fatalf("combined bounds = %s, want %s", got, want)
	}

	checks := []struct {
		point image.Point
		want  color.NRGBA
	}{
		{point: image.Pt(1, 1), want: colors[0]},
		{point: image.Pt(5, 1), want: colors[1]},
		{point: image.Pt(1, 4), want: colors[2]},
		{point: image.Pt(5, 4), want: colors[3]},
	}
	for _, check := range checks {
		if got := combined.NRGBAAt(check.point.X, check.point.Y); got != check.want {
			t.Errorf("pixel at %s = %#v, want %#v", check.point, got, check.want)
		}
	}
}

func TestCombineTalentBackgroundQuadrantsRejectsMisalignedImages(t *testing.T) {
	t.Parallel()

	_, err := combineTalentBackgroundQuadrants([]image.Image{
		image.NewNRGBA(image.Rect(0, 0, 4, 3)),
		image.NewNRGBA(image.Rect(0, 0, 2, 4)),
		image.NewNRGBA(image.Rect(0, 0, 4, 2)),
		image.NewNRGBA(image.Rect(0, 0, 2, 2)),
	})
	if err == nil {
		t.Fatal("expected misaligned quadrants to fail")
	}
}
