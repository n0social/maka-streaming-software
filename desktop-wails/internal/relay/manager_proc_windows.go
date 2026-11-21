//go:build windows

package relay

import (
	"os/exec"
	"syscall"
)

func configureRelayChildProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: syscall.CREATE_NO_WINDOW,
	}
}