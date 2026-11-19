package main

import (
	"context"
	"time"

	"github.com/n0social/maka-streaming-software/desktop-wails/internal/relay"
	"github.com/n0social/maka-streaming-software/desktop-wails/internal/settings"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const makalightVersion = "0.1.0"

// App exposes Go methods to the studio UI (window.maka bridge).
type App struct {
	ctx    context.Context
	relay  *relay.Manager
	settings *settings.Store
	appMode string
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
	return &App{
		relay:    rm,
		settings: store,
		appMode:  "studio",
	}, nil
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	go a.emitRelayLoop()
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
			runtime.EventsEmit(a.ctx, "relay:update", snap)
		}
	}
}

// GetVersionInfo matches preload app:get-version-info.
func (a *App) GetVersionInfo() map[string]string {
	return map[string]string{
		"version":     makalightVersion,
		"product":     "MakaLight",
		"shell":       "wails",
		"relayTarget": "open",
	}
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
		return s
	}
	return a.relay.GetSnapshot()
}

func (a *App) StopRelay() relay.Snapshot {
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
	defer cancel()
	_ = a.relay.Stop(ctx)
	return a.relay.GetSnapshot()
}

func (a *App) RefreshRelay() relay.Snapshot {
	ctx, cancel := context.WithTimeout(a.ctx, 8*time.Second)
	defer cancel()
	_ = a.relay.Refresh(ctx)
	return a.relay.GetSnapshot()
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
		runtime.EventsEmit(a.ctx, "app:mode", mode)
	}
	return a.appMode
}

func (a *App) ExitSettingsMode() string {
	a.appMode = "studio"
	runtime.EventsEmit(a.ctx, "app:mode", a.appMode)
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
	runtime.WindowMinimise(a.ctx)
}

func (a *App) WindowMaximize() bool {
	runtime.WindowToggleMaximise(a.ctx)
	return false
}

func (a *App) WindowClose() {
	runtime.Quit(a.ctx)
}

func (a *App) OpenExternal(url string) {
	runtime.BrowserOpenURL(a.ctx, url)
}

func (a *App) OpenStream() {
	runtime.EventsEmit(a.ctx, "shell:stream")
}

func (a *App) OpenHome() {}

// ListCaptureSources — Phase 1 capture; stub until WGC/DXGI bridge lands.
func (a *App) ListCaptureSources() []map[string]string {
	return []map[string]string{}
}