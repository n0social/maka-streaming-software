//go:build !windows

package relay

import "os/exec"

func configureRelayChildProcess(cmd *exec.Cmd) {}