package cli

import (
	"reflect"
	"testing"
)

func TestBuildWowLoadingScreenManifest(t *testing.T) {
	t.Parallel()

	manifest, fileDataIDs := buildWowLoadingScreenManifest(
		[]wowdataLoadingScreen{
			{ID: 9, NarrowScreenFileDataID: 300},
			{ID: 3, LoadingScreenSkinID: 11, MainImageFileDataID: 100, NarrowScreenFileDataID: 200, LogoFileDataID: 100},
		},
		[]wowdataMap{
			{ID: 44, Name: "Second", Directory: "SecondMap", InstanceType: 1, LoadingScreenID: 3},
			{ID: 12, Name: "First", Directory: "FirstMap", InstanceType: 2, LoadingScreenID: 3},
			{ID: 99, Name: "No screen", LoadingScreenID: 0},
		},
		wowLoadingScreenTarget{Product: "wow_classic_beta", Build: "1.2.3.4", Region: "us", Locale: "enUS"},
	)

	if manifest.Format != wowLoadingScreenManifestFormat {
		t.Fatalf("format = %q, want %q", manifest.Format, wowLoadingScreenManifestFormat)
	}
	if got, want := []int32{manifest.Screens[0].ID, manifest.Screens[1].ID}, []int32{3, 9}; !reflect.DeepEqual(got, want) {
		t.Fatalf("screen IDs = %v, want %v", got, want)
	}
	if got, want := manifest.Screens[0].Maps, []wowLoadingScreenMap{
		{ID: 12, Name: "First", Directory: "FirstMap", InstanceType: 2},
		{ID: 44, Name: "Second", Directory: "SecondMap", InstanceType: 1},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("maps = %#v, want %#v", got, want)
	}
	if got, want := manifest.Screens[0].Images, []wowLoadingScreenImage{
		{Variant: "main", FileDataID: 100, Path: "images/100.webp"},
		{Variant: "narrow", FileDataID: 200, Path: "images/200.webp"},
		{Variant: "logo", FileDataID: 100, Path: "images/100.webp"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("images = %#v, want %#v", got, want)
	}
	if want := []int32{100, 200, 300}; !reflect.DeepEqual(fileDataIDs, want) {
		t.Fatalf("fileDataIDs = %v, want %v", fileDataIDs, want)
	}
}

func TestPruneUnavailableWowLoadingScreenImages(t *testing.T) {
	t.Parallel()

	manifest := wowLoadingScreenManifest{Screens: []wowLoadingScreenRecord{
		{ID: 3, Images: []wowLoadingScreenImage{
			{Variant: "main", FileDataID: 100},
			{Variant: "narrow", FileDataID: 200},
		}},
	}}
	pruneUnavailableWowLoadingScreenImages(&manifest, map[int32]struct{}{100: {}})

	if got, want := manifest.Screens[0].Images, []wowLoadingScreenImage{{Variant: "narrow", FileDataID: 200}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("images = %#v, want %#v", got, want)
	}
}
