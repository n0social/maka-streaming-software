package platform

import (
	"context"
	"testing"
)

func TestFetchViewersInvalidIds(t *testing.T) {
	out := FetchViewers(context.Background(), nil, map[string]any{
		"twitchLogin":     "bad",
		"youtubeVideoId":  "notavalidid",
	})
	if out["twitch"] != nil || out["youtube"] != nil {
		t.Fatalf("%v", out)
	}
}