package main

import (
	"context"
	"time"

	"github.com/n0social/maka-streaming-software/desktop-wails/internal/platform"
)

// GetPlatformViewers — ipc platform:viewers.
func (a *App) GetPlatformViewers(query map[string]any) map[string]any {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return platform.FetchViewers(ctx, nil, query)
}

// PublishPlatformMetadata — ipc platform:publish-metadata (settings-driven).
func (a *App) PublishPlatformMetadata() map[string]any {
	s := a.settings.Get()
	in := platform.MetadataInput{
		Title:          strVal(s["streamTitle"]),
		Description:    strVal(s["streamDescription"]),
		Category:       strVal(s["streamCategory"]),
		TwitchToken:    strVal(s["twitchUserToken"]),
		TwitchClientID: strVal(s["twitchClientId"]),
		YoutubeToken:   strVal(s["youtubeUserToken"]),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	report := platform.PublishMetadata(ctx, nil, in)
	return map[string]any{
		"version": report.Version,
		"twitch": map[string]any{
			"ok":      report.Twitch.Ok,
			"message": report.Twitch.Message,
		},
		"youtube": map[string]any{
			"ok":      report.Youtube.Ok,
			"message": report.Youtube.Message,
		},
	}
}