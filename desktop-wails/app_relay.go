package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/n0social/maka-streaming-software/desktop-wails/internal/relay"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	go a.emitRelayLoop()
	go a.autoStartRelay()
}

func (a *App) autoStartRelay() {
	if a.ctx == nil {
		return
	}
	time.Sleep(400 * time.Millisecond)
	runCtx, cancel := context.WithTimeout(a.ctx, 30*time.Second)
	defer cancel()
	_ = a.relay.Start(runCtx)
	a.emitRelaySnapshot()
}

func (a *App) shutdown(ctx context.Context) {
	stopCtx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	_ = a.relay.Stop(stopCtx)
}

func (a *App) emitRelaySnapshot() {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, "relay:update", a.relay.GetSnapshot())
}

// RevealRelay — ipc relay:reveal (Explorer / file manager).
func (a *App) RevealRelay() string {
	path := a.relay.EntryPath()
	if path == "" {
		return ""
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	revealPathInShell(abs)
	return abs
}

func revealPathInShell(target string) {
	switch runtime.GOOS {
	case "windows":
		_ = exec.Command("explorer", "/select,", target).Start()
	case "darwin":
		_ = exec.Command("open", "-R", target).Start()
	default:
		_ = exec.Command("xdg-open", filepath.Dir(target)).Start()
	}
}

type verifyCheck struct {
	Name   string `json:"name"`
	Ok     bool   `json:"ok"`
	Detail string `json:"detail"`
}

// VerifySystem — ipc diagnostics:verify (relay-focused; matches studio onboarding).
func (a *App) VerifySystem() map[string]any {
	checks := []verifyCheck{}
	entry := a.relay.EntryPath()
	entryOk := entry != ""
	if entryOk {
		if st, err := os.Stat(entry); err != nil || st.IsDir() {
			entryOk = false
		}
	}
	checks = append(checks, verifyCheck{
		Name:   "relay-entry",
		Ok:     entryOk,
		Detail: entry,
	})
	checks = append(checks, verifyCheck{
		Name:   "relay-binary",
		Ok:     entryOk,
		Detail: entry,
	})

	snap := a.relay.GetSnapshot()
	lc := snap.Lifecycle
	lifecycleOk := lc == "ready" || lc == "running" || lc == "live"
	detail := lc
	if snap.Error != nil && fmt.Sprint(snap.Error) != "" {
		detail += " — " + fmt.Sprint(snap.Error)
	}
	checks = append(checks, verifyCheck{
		Name:   "relay-lifecycle",
		Ok:     lifecycleOk,
		Detail: detail,
	})

	healthOk := false
	healthDetail := ""
	req, err := http.NewRequest(http.MethodGet, relay.BaseURL+relay.HealthPath, nil)
	if err != nil {
		healthDetail = err.Error()
	} else {
		client := &http.Client{Timeout: 4 * time.Second}
		res, err := client.Do(req)
		if err != nil {
			healthDetail = err.Error()
		} else {
			healthDetail = fmt.Sprintf("HTTP %d", res.StatusCode)
			healthOk = res.StatusCode >= 200 && res.StatusCode < 300
			res.Body.Close()
		}
	}
	checks = append(checks, verifyCheck{
		Name:   "relay-health",
		Ok:     healthOk,
		Detail: healthDetail,
	})

	checks = append(checks, verifyCheck{
		Name:   "studio-window",
		Ok:     true,
		Detail: "open",
	})

	ok := true
	for _, c := range checks {
		if !c.Ok {
			ok = false
			break
		}
	}

	outChecks := make([]map[string]any, len(checks))
	for i, c := range checks {
		outChecks[i] = map[string]any{
			"name":   c.Name,
			"ok":     c.Ok,
			"detail": c.Detail,
		}
	}
	return map[string]any{
		"ok":          ok,
		"checks":      outChecks,
		"snapshot":    snap,
		"diagnostics": []any{},
	}
}