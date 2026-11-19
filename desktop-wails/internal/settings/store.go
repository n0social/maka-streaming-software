package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// DefaultSettings matches src/main/settings-store.ts defaults (studio-only).
var DefaultSettings = map[string]any{
	"bitrateProfile":                        "720p30",
	"adaptiveEncode":                        true,
	"startupMode":                           "studio",
	"minimizeToTrayWhileLive":               true,
	"labMode":                               false,
	"autoCheckUpdatesOnStartup":             true,
	"recordingSaveFolder":                   "",
	"settingsActiveTab":                     "general",
	"lastStreamPlatform":                    "none",
	"streamTitle":                           "",
	"streamCategory":                        "",
	"streamDescription":                     "",
	"streamChannel":                         "",
	"streamTwitchChatLink":                  "",
	"streamYoutubeChatLink":                 "",
	"streamAlertBoxUrl":                     "",
	"streamIncludeChat":                     false,
	"preferredMicDeviceId":                  "",
	"preferredDesktopAudioOutputDeviceId":   "",
	"audioMicBitrateKbps":                   160,
	"audioDesktopBitrateKbps":               160,
	"videoEncoderPreference":                "system",
	"gpuPreference":                         "default",
	"onboardingComplete":                    false,
	"setupWizardComplete":                   false,
	"sceneImages":                           map[string]any{},
	"customScenes":                          []any{},
	"streamDestinations":                    defaultStreamDestinations(),
	"backupRtmpUrl":                         "",
	"backupRtmpKey":                         "",
	"twitchUserToken":                       "",
	"twitchClientId":                        "",
	"youtubeUserToken":                        "",
}

func defaultStreamDestinations() map[string]any {
	return map[string]any{
		"twitch": map[string]any{"enabled": false, "key": ""},
		"youtube": map[string]any{
			"enabled": false,
			"key":     "",
		},
		"custom": map[string]any{"enabled": false, "url": "", "key": ""},
	}
}

type Store struct {
	mu   sync.Mutex
	path string
	data map[string]any
}

func NewStore() (*Store, error) {
	dir, err := configDir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, "settings.json")
	s := &Store{path: path, data: clone(DefaultSettings)}
	if raw, err := os.ReadFile(path); err == nil {
		var loaded map[string]any
		if json.Unmarshal(raw, &loaded) == nil {
			s.merge(loaded)
		}
	}
	return s, nil
}

func configDir() (string, error) {
	if dir := os.Getenv("MAKALIGHT_CONFIG_DIR"); dir != "" {
		return dir, nil
	}
	config, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(config, "MakaLight"), nil
}

func clone(src map[string]any) map[string]any {
	out := make(map[string]any, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

func (s *Store) merge(partial map[string]any) {
	for k, v := range partial {
		s.data[k] = v
	}
}

func (s *Store) Get() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return clone(s.data)
}

func (s *Store) Set(partial map[string]any) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.merge(partial)
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(s.path, raw, 0o600); err != nil {
		return nil, err
	}
	return clone(s.data), nil
}