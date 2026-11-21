package relay

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRelayStartHealthIntegration(t *testing.T) {
	if os.Getenv("MAKA_RELAY_INTEGRATION") != "1" {
		t.Skip("set MAKA_RELAY_INTEGRATION=1 to run (starts node relay)")
	}
	wd, _ := os.Getwd()
	repoRoot := filepath.Clean(filepath.Join(wd, "..", "..", ".."))
	t.Setenv("MAKA_REPO_ROOT", repoRoot)

	m, err := NewManager()
	if err != nil {
		t.Fatal(err)
	}
	if m.EntryPath() == "" {
		t.Skip("relay entry missing")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	if err := m.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = m.Stop(context.Background())
	}()

	snap := m.GetSnapshot()
	if snap.Lifecycle != "ready" && snap.Lifecycle != "running" {
		t.Fatalf("lifecycle %q err=%v", snap.Lifecycle, snap.Error)
	}

	token, err := m.FetchHealthToken(ctx)
	if err != nil || token == "" {
		t.Fatalf("token: %v", err)
	}

	answer, _, err := m.PublishWhip(ctx, "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n")
	if err != nil {
		t.Fatalf("whip: %v", err)
	}
	if len(answer) < 10 {
		t.Fatalf("short answer %q", answer)
	}
}