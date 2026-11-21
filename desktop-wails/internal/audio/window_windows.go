//go:build windows

package audio

import (
	"fmt"

	"golang.org/x/sys/windows"
)

func platformIsWindows() bool { return true }

func pidForWindowHandle(hwnd uintptr) (int, error) {
	var pid uint32
	_, _ = windows.GetWindowThreadProcessId(windows.HWND(hwnd), &pid)
	if pid == 0 {
		return 0, fmt.Errorf("pid 0 for hwnd %d", hwnd)
	}
	return int(pid), nil
}