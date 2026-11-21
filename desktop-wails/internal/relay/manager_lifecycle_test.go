package relay

import "testing"

func TestLifecycleFromRelayStatus(t *testing.T) {
	t.Parallel()
	cases := []struct {
		status   any
		process  bool
		want     string
	}{
		{map[string]any{"status": "live"}, true, "live"},
		{map[string]any{"status": "error"}, true, "error"},
		{map[string]any{"status": "starting"}, true, "starting"},
		{map[string]any{"status": "idle"}, true, "ready"},
		{nil, true, "ready"},
	}
	for _, tc := range cases {
		if got := lifecycleFromRelayStatus(tc.status, tc.process); got != tc.want {
			t.Fatalf("status %#v process=%v: got %q want %q", tc.status, tc.process, got, tc.want)
		}
	}
}

func TestLifecycleFromRelayStatusNeverRunning(t *testing.T) {
	t.Parallel()
	statuses := []any{
		nil,
		map[string]any{"status": "live"},
		map[string]any{"status": "error"},
		map[string]any{"status": "starting"},
		map[string]any{"status": "idle"},
		map[string]any{"status": "running"},
	}
	for _, st := range statuses {
		for _, processUp := range []bool{true, false} {
			got := lifecycleFromRelayStatus(st, processUp)
			if got == "running" {
				t.Fatalf("legacy lifecycle %q for status %#v process=%v", got, st, processUp)
			}
		}
	}
}

func TestLocalizeRelayHealth(t *testing.T) {
	t.Parallel()
	out := localizeRelayHealth(map[string]any{
		"version":   "0.1.1",
		"streamUrl": "https://example.com/whip",
	})
	m, ok := out.(map[string]any)
	if !ok {
		t.Fatal("expected map")
	}
	if m["streamUrl"] != WhipURL {
		t.Fatalf("streamUrl %v", m["streamUrl"])
	}
}