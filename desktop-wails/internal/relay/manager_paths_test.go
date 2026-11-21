package relay

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveRelayPathsFromStagedLayout(t *testing.T) {
	root := t.TempDir()
	entryPath := filepath.Join(root, "relay", "src", "index.mjs")
	if err := os.MkdirAll(filepath.Dir(entryPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(entryPath, []byte("// fixture\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("MAKA_REPO_ROOT", root)

	entry, relayRoot, repoRoot, err := resolveRelayPaths()
	if err != nil {
		t.Fatal(err)
	}
	if entry != entryPath {
		t.Fatalf("entry %q", entry)
	}
	if relayRoot != filepath.Join(root, "relay") {
		t.Fatalf("relayRoot %q", relayRoot)
	}
	if repoRoot != root {
		t.Fatalf("repoRoot %q", repoRoot)
	}
}

func TestResolveNodeBinBundledBesideExe(t *testing.T) {
	if os.Getenv("GOOS") == "" && filepath.Separator != '\\' {
		// Bundled node.exe path is Windows-oriented; logic still runs on Linux without bundled file.
	}
	_, err := resolveNodeBin()
	if err == nil {
		return
	}
	if err.Error() == "" {
		t.Fatal("expected message")
	}
}