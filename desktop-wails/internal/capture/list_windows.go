//go:build windows

package capture

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32               = windows.NewLazySystemDLL("user32.dll")
	procEnumWindows      = user32.NewProc("EnumWindows")
	procIsWindowVisible  = user32.NewProc("IsWindowVisible")
	procGetWindowTextW   = user32.NewProc("GetWindowTextW")
	procGetWindowTextLen = user32.NewProc("GetWindowTextLengthW")
	procGetSystemMetrics = user32.NewProc("GetSystemMetrics")
)

const smCMonitors = 80

type windowEntry struct {
	hwnd windows.HWND
	name string
}

func platformListSources() []Source {
	out := []Source{}
	for i, name := range enumScreens() {
		out = append(out, Source{
			ID:                fmt.Sprintf("screen:%d:0", i),
			Name:              name,
			Type:              "screen",
			ThumbnailDataURL: "",
		})
	}
	for _, w := range enumWindows() {
		out = append(out, Source{
			ID:                fmt.Sprintf("window:%d:0", uint32(w.hwnd)),
			Name:              w.name,
			Type:              "window",
			ThumbnailDataURL: "",
		})
	}
	return out
}

func enumScreens() []string {
	r, _, _ := procGetSystemMetrics.Call(smCMonitors)
	n := int(r)
	if n < 1 {
		n = 1
	}
	names := make([]string, n)
	for i := 0; i < n; i++ {
		names[i] = fmt.Sprintf("Screen %d", i+1)
	}
	return names
}

func enumWindows() []windowEntry {
	var list []windowEntry
	cb := syscall.NewCallback(func(hwnd uintptr, lparam uintptr) uintptr {
		h := windows.HWND(hwnd)
		if skipWindow(h) {
			return 1
		}
		name := windowTitle(h)
		if name == "" {
			return 1
		}
		list = append(list, windowEntry{hwnd: h, name: name})
		return 1
	})
	procEnumWindows.Call(cb, 0)
	return list
}

func skipWindow(hwnd windows.HWND) bool {
	visible, _, _ := procIsWindowVisible.Call(uintptr(hwnd))
	if visible == 0 {
		return true
	}
	if hwnd == windows.GetForegroundWindow() {
		// Still allow foreground — studio may not be focused during pick
	}
	title := windowTitle(hwnd)
	if title == "" {
		return true
	}
	// Skip common shell/overlay noise
	if title == "Program Manager" || title == "MSCTFIME UI" {
		return true
	}
	return false
}

func windowTitle(hwnd windows.HWND) string {
	n, _, _ := procGetWindowTextLen.Call(uintptr(hwnd))
	if n == 0 {
		return ""
	}
	buf := make([]uint16, n+1)
	procGetWindowTextW.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	return windows.UTF16ToString(buf)
}