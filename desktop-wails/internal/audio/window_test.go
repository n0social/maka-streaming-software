package audio

import "testing"

func TestWindowHandleFromCaptureSourceID(t *testing.T) {
	hwnd, ok := windowHandleFromCaptureSourceID("window:12345:0")
	if !ok || hwnd != 12345 {
		t.Fatalf("got %v %v", hwnd, ok)
	}
	_, ok = windowHandleFromCaptureSourceID("screen:0:0")
	if ok {
		t.Fatal("expected false for screen")
	}
}

func TestStartNonWindows(t *testing.T) {
	if platformIsWindows() {
		t.Skip("linux stub")
	}
	svc := NewWindowService(nil)
	res := svc.Start("window:1:0")
	if res.Ok || res.Message == "" {
		t.Fatalf("%+v", res)
	}
}