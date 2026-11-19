package relay

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveRelayPathsFromRepoRoot(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	repoRoot := filepath.Clean(filepath.Join(wd, "..", ".."))
	t.Setenv("MAKA_REPO_ROOT", repoRoot)
	entry, relayRoot, foundRoot, err := resolveRelayPaths()
	if err != nil {
		t.Skip("relay not in workspace:", err)
	}
	if foundRoot != repoRoot {
		t.Fatalf("repo root %q != %q", foundRoot, repoRoot)
	}
	if filepath.Base(filepath.Dir(filepath.Dir(entry))) != "relay" {
		t.Fatalf("unexpected entry %s", entry)
	}
	if filepath.Base(relayRoot) != "relay" {
		t.Fatalf("relayRoot %s", relayRoot)
	}
}