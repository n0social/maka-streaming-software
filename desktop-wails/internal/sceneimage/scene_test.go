package sceneimage

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadDataURLPng(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "x.png")
	if err := os.WriteFile(p, []byte{0x89, 0x50, 0x4e, 0x47}, 0o644); err != nil {
		t.Fatal(err)
	}
	url, ok := ReadDataURL(p)
	if !ok || !strings.HasPrefix(url, "data:image/png;base64,") {
		t.Fatalf("%v %q", ok, url)
	}
}