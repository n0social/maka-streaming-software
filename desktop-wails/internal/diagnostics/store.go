package diagnostics

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/n0social/maka-streaming-software/desktop-wails/internal/appmeta"
	"github.com/n0social/maka-streaming-software/desktop-wails/internal/qos"
)

const maxEvents = 200

type Level string

type Event struct {
	ID      string         `json:"id"`
	At      string         `json:"at"`
	Level   Level          `json:"level"`
	Source  string         `json:"source"`
	Message string         `json:"message"`
	Stack   string         `json:"stack,omitempty"`
	Detail  map[string]any `json:"detail,omitempty"`
}

type Store struct {
	mu    sync.Mutex
	seq   int
	events []Event
	emit  func(Event)
}

func NewStore(emit func(Event)) *Store {
	if emit == nil {
		emit = func(Event) {}
	}
	return &Store{emit: emit}
}

func (s *Store) List() []any {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]any, len(s.events))
	for i, e := range s.events {
		out[i] = e
	}
	return out
}

func (s *Store) Clear() []any {
	s.mu.Lock()
	s.events = nil
	s.mu.Unlock()
	return s.List()
}

func (s *Store) Record(level Level, source, message string, stack string, detail map[string]any) Event {
	s.mu.Lock()
	s.seq++
	seq := s.seq
	s.mu.Unlock()
	ev := Event{
		ID:      fmt.Sprintf("%d-%d", time.Now().UnixMilli(), seq),
		At:      time.Now().UTC().Format(time.RFC3339Nano),
		Level:   level,
		Source:  source,
		Message: message,
		Stack:   stack,
		Detail:  detail,
	}
	s.mu.Lock()
	s.events = append(s.events, ev)
	if len(s.events) > maxEvents {
		s.events = s.events[len(s.events)-maxEvents:]
	}
	s.mu.Unlock()

	s.appendLog(ev)
	s.emit(ev)
	return ev
}

func (s *Store) Recent(n int) []Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	if n <= 0 || len(s.events) == 0 {
		return nil
	}
	start := 0
	if len(s.events) > n {
		start = len(s.events) - n
	}
	out := make([]Event, len(s.events[start:]))
	copy(out, s.events[start:])
	return out
}

func logsDir() (string, error) {
	if dir := os.Getenv("MAKA_CONFIG_DIR"); dir != "" {
		return filepath.Join(dir, "logs"), nil
	}
	config, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(config, "Maka", "logs"), nil
}

func (s *Store) appendLog(ev Event) {
	dir, err := logsDir()
	if err != nil {
		return
	}
	_ = os.MkdirAll(dir, 0o755)
	path := filepath.Join(dir, "maka-diagnostics.log")
	line, err := json.Marshal(ev)
	if err != nil {
		return
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(line, '\n'))
}

func (s *Store) ExportDiagnosticsBundle() (string, error) {
	dir, err := logsDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	out := filepath.Join(dir, fmt.Sprintf("maka-diagnostics-%d.json", time.Now().UnixMilli()))
	payload := map[string]any{
		"exportedAt":  time.Now().UTC().Format(time.RFC3339Nano),
		"appVersion":  appmeta.AppVersion(),
		"platform":    runtime.GOOS,
		"arch":        runtime.GOARCH,
		"go":          runtime.Version(),
		"makalight":   true,
		"events":      s.List(),
	}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(out, append(raw, '\n'), 0o644); err != nil {
		return "", err
	}
	return out, nil
}

func (s *Store) ExportQosBundle(snapshot any) (string, error) {
	dir, err := logsDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	out := filepath.Join(dir, fmt.Sprintf("maka-qos-%d.json", time.Now().UnixMilli()))
	events := s.Recent(40)
	redacted := make([]map[string]any, 0, len(events))
	for _, ev := range events {
		redacted = append(redacted, map[string]any{
			"id":      ev.ID,
			"at":      ev.At,
			"level":   ev.Level,
			"source":  ev.Source,
			"message": qos.RedactSupportText(ev.Message),
			"detail":  ev.Detail,
		})
	}
	payload := map[string]any{
		"exportedAt":  time.Now().UTC().Format(time.RFC3339Nano),
		"appVersion":  appmeta.AppVersion(),
		"platform":    runtime.GOOS,
		"snapshot":    snapshot,
		"diagnostics": redacted,
	}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(out, append(raw, '\n'), 0o644); err != nil {
		return "", err
	}
	return out, nil
}