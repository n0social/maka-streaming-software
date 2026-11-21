package diagnostics

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRecordAndExport(t *testing.T) {
	t.Setenv("MAKA_CONFIG_DIR", t.TempDir())
	s := NewStore(nil)
	s.Record(Level("info"), "test", "hello", "", nil)
	if len(s.List()) != 1 {
		t.Fatal("list")
	}
	path, err := s.ExportDiagnosticsBundle()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
	qosPath, err := s.ExportQosBundle(map[string]any{"demo": true})
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(qosPath) == "" {
		t.Fatal("qos path")
	}
}