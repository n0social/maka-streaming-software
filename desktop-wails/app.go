package main

import (
	"context"
	"runtime"
	"time"

	"github.com/n0social/maka-streaming-software/desktop-wails/internal/appmeta"
	"github.com/n0social/maka-streaming-software/desktop-wails/internal/audio"
	"github.com/n0social/maka-streaming-software/desktop-wails/internal/capture"
	"github.com/n0social/maka-streaming-software/desktop-wails/internal/relay"
	"github.com/n0social/maka-streaming-software/desktop-wails/internal/settings"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// VersionInfo matches preload app:get-version-info / renderer settings-view.
type VersionInfo struct {
	AppVersion   string  `json:"appVersion"`
	RelayVersion *string `json:"relayVersion"`
	Platform     string  `json:"platform"`
}

// App exposes Go methods to the studio UI (window.maka bridge).
type App struct {
	ctx      context.Context
	relay    *relay.Manager
	settings *settings.Store
	capture  *capture.Service
	winAudio *audio.WindowService
	appMode  string
}

func NewApp() (*App, error) {
	store, err := settings.NewStore()
	if err != nil {
		return nil, err
	}
	rm, err := relay.NewManager()
	if err != nil {
		return nil, err
	}
	app := &App{
		relay:    rm,
		settings: store,
		capture:  capture.NewService(),
		appMode:  "studio",
	}
	app.winAudio = audio.NewWindowService(app.emitWindowAudioPcm)
	return app, nil
}


func (a *App) emitRelayLoop() {
	if a.ctx == nil {
		return
	}
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			snap := a.relay.GetSnapshot()
			wailsruntime.EventsEmit(a.ctx, "relay:update", snap)
		}
	}
}

// GetVersionInfo matches preload app:get-version-info (1:1 with Electron).
func (a *App) GetVersionInfo() VersionInfo {
	snap := a.relay.GetSnapshot()
	var relayVer *string
	if health, ok := snap.Health.(map[string]any); ok {
		if v, ok := health["version"].(string); ok && v != "" {
			relayVer = &v
		}
	}
	return VersionInfo{
		AppVersion:   appmeta.AppVersion(),
		RelayVersion: relayVer,
		Platform:     runtimeEnvironment(),
	}
}

func runtimeEnvironment() string {
	return runtime.GOOS
}

func (a *App) GetRelay() relay.Snapshot {
	return a.relay.GetSnapshot()
}

func (a *App) StartRelay() relay.Snapshot {
	ctx, cancel := context.WithTimeout(a.ctx, 25*time.Second)
	defer cancel()
	if err := a.relay.Start(ctx); err != nil {
		s := a.relay.GetSnapshot()
		if s.Error == nil || s.Error == "" {
			s.Error = err.Error()
		}
		a.emitRelaySnapshot()
		return s
	}
	s := a.relay.GetSnapshot()
	a.emitRelaySnapshot()
	return s
}

func (a *App) StopRelay() relay.Snapshot {
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
	defer cancel()
	_ = a.relay.Stop(ctx)
	s := a.relay.GetSnapshot()
	a.emitRelaySnapshot()
	return s
}

func (a *App) RefreshRelay() relay.Snapshot {
	ctx, cancel := context.WithTimeout(a.ctx, 8*time.Second)
	defer cancel()
	_ = a.relay.Refresh(ctx)
	s := a.relay.GetSnapshot()
	a.emitRelaySnapshot()
	return s
}

type whipPublishPayload struct {
	Sdp   string `json:"sdp"`
	Token string `json:"token"`
}

type whipPublishResult struct {
	AnswerSdp   string  `json:"answerSdp"`
	ResourceUrl *string `json:"resourceUrl"`
}

func (a *App) PublishWhipOffer(sdp string, _token string) (whipPublishResult, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 30*time.Second)
	defer cancel()
	answer, loc, err := a.relay.PublishWhip(ctx, sdp)
	if err != nil {
		return whipPublishResult{}, err
	}
	var resource *string
	if loc != "" {
		resource = &loc
	}
	return whipPublishResult{AnswerSdp: answer, ResourceUrl: resource}, nil
}

type whipClosePayload struct {
	ResourceUrl string `json:"resourceUrl"`
	Token       string `json:"token"`
}

func (a *App) CloseWhipResource(payload whipClosePayload) {
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
	defer cancel()
	_ = a.relay.CloseWhipResource(ctx, payload.ResourceUrl)
}

func (a *App) GetMode() string {
	return a.appMode
}

func (a *App) GetWorkspaceMode() string {
	return "studio"
}

func (a *App) SetMode(mode string) string {
	if mode == "studio" || mode == "settings" {
		a.appMode = mode
		wailsruntime.EventsEmit(a.ctx, "app:mode", mode)
	}
	return a.appMode
}

func (a *App) ExitSettingsMode() string {
	a.appMode = "studio"
	wailsruntime.EventsEmit(a.ctx, "app:mode", a.appMode)
	return a.appMode
}

func (a *App) GetSettings() map[string]any {
	return a.settings.Get()
}

func (a *App) SetSettings(partial map[string]any) map[string]any {
	out, err := a.settings.Set(partial)
	if err != nil {
		return a.settings.Get()
	}
	return out
}

func (a *App) WindowMinimize() {
	wailsruntime.WindowMinimise(a.ctx)
}

func (a *App) WindowMaximize() bool {
	wailsruntime.WindowToggleMaximise(a.ctx)
	return false
}

func (a *App) WindowClose() {
	wailsruntime.Quit(a.ctx)
}

func (a *App) OpenExternal(url string) {
	if a.ctx == nil {
		return
	}
	allowed, ok := shellExternalURLAllowed(url)
	if !ok {
		return
	}
	wailsruntime.BrowserOpenURL(a.ctx, allowed)
}

// ListCaptureSources — ipc capture:list-sources (1:1 DTO).
func (a *App) ListCaptureSources() []capture.Source {
	return a.capture.List()
}

// SetPreferredCaptureSource — ipc capture:set-preferred.
func (a *App) SetPreferredCaptureSource(sourceID string) {
	a.capture.SetPreferred(sourceID)
}

func (a *App) emitWindowAudioPcm(ev audio.PcmEvent) {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, "window-audio:pcm", ev)
}

// StartWindowAudio — ipc window-audio:start.
func (a *App) StartWindowAudio(sourceID string) audio.StartResult {
	return a.winAudio.Start(sourceID)
}

// StopWindowAudio — ipc window-audio:stop.
func (a *App) StopWindowAudio() {
	a.winAudio.Stop()
}