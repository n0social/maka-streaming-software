package relay

import "testing"

func TestLifecycleFromRelayStatus(t *testing.T) {
	cases := []struct {
		status map[string]any
		proc   bool
		want   string
	}{
		{nil, false, "stopped"},
		{nil, true, "ready"},
		{map[string]any{"status": "live"}, true, "live"},
		{map[string]any{"status": "error"}, true, "error"},
		{map[string]any{"status": "starting"}, true, "starting"},
		{map[string]any{"status": "idle"}, true, "ready"},
	}
	for _, c := range cases {
		got := lifecycleFromRelayStatus(c.status, c.proc)
		if got != c.want {
			t.Fatalf("%+v proc=%v: got %q want %q", c.status, c.proc, got, c.want)
		}
	}
}