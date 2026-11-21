package main

import (
	"regexp"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var shellExternalURLPattern = regexp.MustCompile(`^(?i)(https?:|mailto:)`)

func shellExternalURLAllowed(raw string) (string, bool) {
	url := strings.TrimSpace(raw)
	if url == "" {
		return "", false
	}
	if !shellExternalURLPattern.MatchString(url) {
		return "", false
	}
	return url, true
}

// OpenStream — ipc shell:open-stream (focus studio; intro dismissed in-renderer on Stream click).
func (a *App) OpenStream() {
	if a.ctx == nil {
		return
	}
	wailsruntime.WindowUnminimise(a.ctx)
	wailsruntime.WindowShow(a.ctx)
	if a.appMode != "studio" {
		a.appMode = "studio"
		wailsruntime.EventsEmit(a.ctx, "app:mode", "studio")
	}
	wailsruntime.EventsEmit(a.ctx, "shell:stream", map[string]any{"source": "main"})
}

const homePageURL = "https://makalive.stream"

// OpenHome — ipc shell:open-home.
func (a *App) OpenHome() {
	if a.ctx == nil {
		return
	}
	wailsruntime.BrowserOpenURL(a.ctx, homePageURL)
}