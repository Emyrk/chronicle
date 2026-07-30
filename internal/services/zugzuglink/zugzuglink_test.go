package zugzuglink_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/services/zugzuglink"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestUnmarshalCharacterQuirks(t *testing.T) {
	t.Parallel()

	var resp zugzuglink.Response
	err := json.Unmarshal([]byte(`{
		"verified": true,
		"characters": [
			{"name": "Axm", "level": 22, "guild": "Zug Zug", "realmKey": "chromiecraft", "gameId": "575928"},
			{"name": "Taco", "level": 42, "guild": false, "realmKey": "eversong-wilds", "gameId": false},
			{"name": "Holycows", "level": 60, "guild": "Zug Zug", "realmKey": "eversong-wilds", "gameId": ""}
		]
	}`), &resp)
	require.NoError(t, err)
	require.True(t, resp.Verified)
	require.Len(t, resp.Characters, 3)
	require.Equal(t, "Zug Zug", resp.Characters[0].Guild)
	require.Equal(t, "chromiecraft", resp.Characters[0].RealmKey)
	require.Equal(t, "chromiecraft", resp.Characters[0].RealmName())
	require.Equal(t, guid.GUID(0x000000000008C9B8), resp.Characters[0].GameID)
	require.Equal(t, "", resp.Characters[1].Guild)
	require.Equal(t, 42, resp.Characters[1].Level)
	require.True(t, resp.Characters[1].GameID.IsZero())
	require.True(t, resp.Characters[2].GameID.IsZero())
}

func TestSource(t *testing.T) {
	t.Parallel()
	require.Equal(t, "zug-zug/https://ambershire.com", zugzuglink.Source("https://ambershire.com/"))
}

func TestFetchByDiscordID(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/api/chronicle/discord/300817857665826817", r.URL.Path)
		require.Equal(t, "Bearer sekrit", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"verified": true, "characters": [{"name": "Holycows", "level": 60, "guild": "Zug Zug"}]}`))
	}))
	defer srv.Close()

	client := zugzuglink.New(srv.URL, "sekrit")
	resp, err := client.FetchByDiscordID(ctx, "300817857665826817")
	require.NoError(t, err)
	require.True(t, resp.Verified)
	require.Len(t, resp.Characters, 1)
	require.Equal(t, "Holycows", resp.Characters[0].Name)

	// Unverified user.
	srv2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"verified": false, "characters": []}`))
	}))
	defer srv2.Close()
	resp, err = zugzuglink.New(srv2.URL, "sekrit").FetchByDiscordID(ctx, "1")
	require.NoError(t, err)
	require.False(t, resp.Verified)

	// Provider error surfaces.
	srv3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv3.Close()
	_, err = zugzuglink.New(srv3.URL, "bad").FetchByDiscordID(ctx, "1")
	require.Error(t, err)
}
