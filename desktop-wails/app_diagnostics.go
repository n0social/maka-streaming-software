package main

import (
	"fmt"
	"strings"

	"github.com/n0social/maka-streaming-software/desktop-wails/internal/diagnostics"
	"github.com/n0social/maka-streaming-software/desktop-wails/internal/qos"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) emitDiagnostic(ev diagnostics.Event) {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, "diagnostics:event", ev)
}

// ListDiagnostics — ipc diagnostics:list.
func (a *App) ListDiagnostics() []any {
	return a.diag.List()
}

// RecordDiagnostic — ipc diagnostics:record (renderer QoS log).
func (a *App) RecordDiagnostic(event map[string]any) {
	if event == nil {
		return
	}
	level := diagnostics.Level("info")
	if s, ok := event["level"].(string); ok {
		switch s {
		case "info", "warn", "error", "fatal":
			level = diagnostics.Level(s)
		}
	}
	source := "qos"
	if s, ok := event["source"].(string); ok && strings.TrimSpace(s) != "" {
		source = strings.TrimSpace(s)
		if len(source) > 48 {
			source = source[:48]
		}
	}
	message := "qos"
	if s, ok := event["message"].(string); ok && strings.TrimSpace(s) != "" {
		message = strings.TrimSpace(s)
		if len(message) > 300 {
			message = message[:300]
		}
	}
	detail := map[string]any{}
	if d, ok := event["detail"].(map[string]any); ok {
		for k, v := range d {
			key := k
			if len(key) > 32 {
				key = key[:32]
			}
			switch t := v.(type) {
			case string:
				val := t
				if len(val) > 240 {
					val = val[:240]
				}
				detail[key] = val
			case float64:
				detail[key] = t
			}
		}
	}
	a.diag.Record(level, source, message, "", detail)
}

// ClearDiagnostics — ipc diagnostics:clear.
func (a *App) ClearDiagnostics() []any {
	return a.diag.Clear()
}

// ExportDiagnostics — ipc diagnostics:export.
func (a *App) ExportDiagnostics() string {
	path, err := a.diag.ExportDiagnosticsBundle()
	if err != nil {
		return ""
	}
	return path
}

func numVal(v any) *float64 {
	switch t := v.(type) {
	case float64:
		if t != t {
			return nil
		}
		return &t
	case int:
		f := float64(t)
		return &f
	default:
		return nil
	}
}

func strValShort(v any, max int) *string {
	s, ok := v.(string)
	if !ok {
		return nil
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	if len(s) > max {
		s = s[:max]
	}
	return &s
}

// ExportQosBundle — ipc qos:export.
func (a *App) ExportQosBundle(payload map[string]any) map[string]any {
	fail := func(reason string) map[string]any {
		return map[string]any{
			"ok":      false,
			"path":    "",
			"score":   0,
			"grade":   string(qos.GradePoor),
			"reasons": []string{reason},
		}
	}
	if payload == nil {
		return fail("empty payload")
	}
	whip, _ := payload["whip"].(map[string]any)
	relay, _ := payload["relay"].(map[string]any)
	if whip == nil {
		whip = map[string]any{}
	}
	if relay == nil {
		relay = map[string]any{}
	}
	rtt := numVal(whip["roundTripMs"])
	if rtt == nil {
		rtt = numVal(relay["latencyMs"])
	}
	drop := qos.DropPercentFromCounts(numVal(whip["framesDropped"]), numVal(whip["framesEncoded"]))
	var relayErr string
	if s := strValShort(relay["error"], 300); s != nil {
		relayErr = qos.RedactSupportText(*s)
	}
	scored := qos.Compute(struct {
		RttMs       *float64
		DropPercent *float64
		RelayError  string
	}{rtt, drop, relayErr})

	snapshot := map[string]any{
		"score": scored,
		"whip": map[string]any{
			"roundTripMs":       numVal(whip["roundTripMs"]),
			"framesDropped":     numVal(whip["framesDropped"]),
			"framesEncoded":     numVal(whip["framesEncoded"]),
			"framesPerSecond":   numVal(whip["framesPerSecond"]),
			"mbps":              numVal(whip["mbps"]),
		},
		"relay": map[string]any{
			"status":        strValShort(relay["status"], 32),
			"lifecycle":     strValShort(relay["lifecycle"], 32),
			"latencyMs":     numVal(relay["latencyMs"]),
			"droppedFrames": numVal(relay["droppedFrames"]),
			"bitrateMbps":   numVal(relay["bitrateMbps"]),
			"error":         strOrNil(relayErr),
		},
	}

	path, err := a.diag.ExportQosBundle(snapshot)
	if err != nil {
		return fail(err.Error())
	}
	a.diag.Record(diagnostics.Level("info"), "qos.export",
		fmt.Sprintf("QoS %d (%s)", scored.Score, scored.Grade), "", map[string]any{"path": path})

	reasons := make([]any, len(scored.Reasons))
	for i, r := range scored.Reasons {
		reasons[i] = r
	}
	return map[string]any{
		"ok":      true,
		"path":    path,
		"score":   scored.Score,
		"grade":   string(scored.Grade),
		"reasons": reasons,
	}
}

func strOrNil(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}