package recording

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBytesFromBridgeValue(t *testing.T) {
	b, ok := BytesFromBridgeValue([]any{float64(1), float64(2), float64(255)})
	if !ok || len(b) != 3 || b[2] != 255 {
		t.Fatalf("%v %v", ok, b)
	}
}

func TestSaveToFolderWithoutDialog(t *testing.T) {
	dir := t.TempDir()
	data := []byte("webm-chunk")
	path := filepath.Join(dir, "clip.webm")
	if ShouldUseSaveDialog(dir, false) {
		t.Fatal("expected direct save")
	}
	if err := WriteFile(path, data); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil || string(raw) != "webm-chunk" {
		t.Fatal(err)
	}
}