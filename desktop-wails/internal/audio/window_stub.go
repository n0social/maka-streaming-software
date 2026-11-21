//go:build !windows

package audio

func platformIsWindows() bool { return false }

func pidForWindowHandle(_ uintptr) (int, error) { return 0, nil }