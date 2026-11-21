//go:build windows

package relay

import (
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

func configureRelayChildProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NO_WINDOW,
	}
}