package capture

import (
	"encoding/json"
	"testing"
)

func TestSourceDTOShape(t *testing.T) {
	s := Source{
		ID:                "screen:0:0",
		Name:              "Screen 1",
		Type:              "screen",
		ThumbnailDataURL: "",
	}
	raw, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"id", "name", "type", "thumbnailDataUrl"} {
		if _, ok := m[key]; !ok {
			t.Fatalf("missing key %q", key)
		}
	}
}

func TestPreferredCaptureSource(t *testing.T) {
	svc := NewService()
	if svc.Preferred() != "" {
		t.Fatal("expected empty preferred")
	}
	svc.SetPreferred("window:42:0")
	if svc.Preferred() != "window:42:0" {
		t.Fatalf("got %q", svc.Preferred())
	}
	svc.SetPreferred("")
	if svc.Preferred() != "" {
		t.Fatal("expected cleared preferred")
	}
}

func TestListNonWindowsEmpty(t *testing.T) {
	list := platformListSources()
	if list == nil {
		t.Fatal("expected non-nil slice")
	}
}