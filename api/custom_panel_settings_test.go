package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/custompanelapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

const customPanelTestCommit = "0123456789abcdef0123456789abcdef01234567"

type staticCustomPanelReleaseResolver struct {
	response chroniclesdk.CustomPanelResolveResponse
	calls    int
}

func (r *staticCustomPanelReleaseResolver) ResolveRelease(context.Context, string, string) (chroniclesdk.CustomPanelResolveResponse, error) {
	r.calls++
	return r.response, nil
}

func customPanelTestResponse(name, manifestSHA string) chroniclesdk.CustomPanelResolveResponse {
	manifest := chroniclesdk.CustomPanelManifest{
		SchemaVersion: 1,
		Plugin:        chroniclesdk.CustomPanelManifestPlugin{ID: "github:owner/repo", Name: name, Version: "1.0.0"},
		Host:          chroniclesdk.CustomPanelManifestHost{APIVersion: 1},
		Artifacts: chroniclesdk.CustomPanelManifestArtifacts{
			Entry: chroniclesdk.CustomPanelManifestArtifact{Path: "dist/panel.js", SHA256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Size: 12},
		},
		Panels: []chroniclesdk.CustomPanelManifestPanel{{ID: "test", Name: "Test"}},
	}
	if manifestSHA == "" {
		canonical, err := custompanelapi.CanonicalManifest(manifest)
		if err != nil {
			panic(err)
		}
		digest := sha256.Sum256(canonical)
		manifestSHA = hex.EncodeToString(digest[:])
	}
	return chroniclesdk.CustomPanelResolveResponse{
		Repository: "owner/repo", CommitSHA: customPanelTestCommit, Manifest: manifest,
		ManifestSHA256: manifestSHA,
		Artifacts:      custompanelapi.ArtifactSet("owner/repo", customPanelTestCommit, manifest.Artifacts),
	}
}

func installationFromResponse(response chroniclesdk.CustomPanelResolveResponse) chroniclesdk.CustomPanelInstallation {
	return chroniclesdk.CustomPanelInstallation{
		Repository: response.Repository, CommitSHA: response.CommitSHA, InstalledRef: "main",
		Manifest: response.Manifest, ManifestSHA256: response.ManifestSHA256, Artifacts: response.Artifacts,
		Enabled: true,
	}
}

func TestPrepareCustomPanelReleasesRejectsForgedFirstWriter(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	authoritative := customPanelTestResponse("Authoritative", "")
	forged := customPanelTestResponse("Forged", "")
	forgedInstallation := installationFromResponse(forged)
	require.NoError(t, custompanelapi.ValidateStoredInstallation(forgedInstallation), "forged payload should pass structural client-payload validation")
	resolver := &staticCustomPanelReleaseResolver{response: authoritative}

	_, err := prepareCustomPanelReleases(ctx, store, resolver, []chroniclesdk.CustomPanelInstallation{forgedInstallation})
	require.ErrorIs(t, err, errCustomPanelReleaseMismatch)
	require.Equal(t, 1, resolver.calls)

	_, err = store.GetCustomPanelReleaseByRepositoryCommit(ctx, database.GetCustomPanelReleaseByRepositoryCommitParams{
		Repository: "owner/repo", CommitSha: customPanelTestCommit,
	})
	require.True(t, errors.Is(err, pgx.ErrNoRows), "forged first-writer metadata must not create a shared release")
}

func TestPrepareCustomPanelReleasesReusesExistingReleaseWithoutFetch(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	response := customPanelTestResponse("Authoritative", "")
	manifest, err := json.Marshal(response.Manifest)
	require.NoError(t, err)
	_, err = store.InsertCustomPanelRelease(ctx, database.InsertCustomPanelReleaseParams{
		Repository: response.Repository, CommitSha: response.CommitSHA, Manifest: manifest, ManifestSha256: response.ManifestSHA256,
	})
	require.NoError(t, err)
	resolver := &staticCustomPanelReleaseResolver{response: response}

	prepared, err := prepareCustomPanelReleases(ctx, store, resolver, []chroniclesdk.CustomPanelInstallation{installationFromResponse(response)})
	require.NoError(t, err)
	require.Len(t, prepared, 1)
	require.Zero(t, resolver.calls)
}
