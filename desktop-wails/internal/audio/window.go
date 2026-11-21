package audio

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

// StartResult matches Electron window-audio:start JSON.
type StartResult struct {
	Ok      bool   `json:"ok"`
	Session int    `json:"session,omitempty"`
	Message string `json:"message,omitempty"`
}

// PcmEvent matches main → renderer window-audio:pcm payload.
type PcmEvent struct {
	Session int    `json:"session"`
	Pcm     []byte `json:"pcm"`
}

// WindowService mirrors src/main/window-process-audio.ts (Windows + loopback-capture).
type WindowService struct {
	mu      sync.Mutex
	session int
	cmd     *exec.Cmd
	cancel  context.CancelFunc
	emit    func(PcmEvent)
}

func NewWindowService(emit func(PcmEvent)) *WindowService {
	if emit == nil {
		emit = func(PcmEvent) {}
	}
	return &WindowService{emit: emit}
}

func (s *WindowService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.session++
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
	s.cmd = nil
}

func (s *WindowService) Start(sourceID string) StartResult {
	s.Stop()
	if !platformIsWindows() {
		return StartResult{Ok: false, Message: "Game audio follows a window on Windows."}
	}
	hwnd, ok := windowHandleFromCaptureSourceID(sourceID)
	if !ok {
		return StartResult{Ok: false, Message: "Pick a gameplay window for game audio."}
	}
	pid, err := pidForWindowHandle(hwnd)
	if err != nil || pid <= 0 {
		return StartResult{Ok: false, Message: "Could not find the app for that window."}
	}
	worker, err := resolveWorkerScript()
	if err != nil {
		return StartResult{Ok: false, Message: "Window audio capture is unavailable in this build."}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	active := s.session + 1
	s.session = active

	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	repoRoot := filepath.Dir(filepath.Dir(filepath.Dir(worker)))
	cmd := exec.CommandContext(ctx, nodeBin(), worker, strconv.Itoa(pid))
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), nodePathEnv(repoRoot))
	cmd.Stderr = os.Stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return StartResult{Ok: false, Message: err.Error()}
	}
	if err := cmd.Start(); err != nil {
		cancel()
		return StartResult{Ok: false, Message: "Could not capture that window’s audio."}
	}
	s.cmd = cmd
	go s.pumpPCM(stdout, active, cancel)
	return StartResult{Ok: true, Session: active}
}

func (s *WindowService) pumpPCM(r io.Reader, session int, cancel context.CancelFunc) {
	defer cancel()
	br := bufio.NewReader(r)
	for {
		var lenBuf [4]byte
		if _, err := io.ReadFull(br, lenBuf[:]); err != nil {
			return
		}
		n := int(uint32(lenBuf[0]) | uint32(lenBuf[1])<<8 | uint32(lenBuf[2])<<16 | uint32(lenBuf[3])<<24)
		if n <= 0 || n > 8*1024*1024 {
			return
		}
		pcm := make([]byte, n)
		if _, err := io.ReadFull(br, pcm); err != nil {
			return
		}
		s.mu.Lock()
		if session != s.session {
			s.mu.Unlock()
			return
		}
		s.mu.Unlock()
		s.emit(PcmEvent{Session: session, Pcm: pcm})
	}
}

func windowHandleFromCaptureSourceID(sourceID string) (uintptr, bool) {
	parts := strings.Split(sourceID, ":")
	if len(parts) < 2 || parts[0] != "window" {
		return 0, false
	}
	hwnd, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil || hwnd == 0 {
		return 0, false
	}
	return uintptr(hwnd), true
}

func resolveWorkerScript() (string, error) {
	roots := repoRoots()
	for _, root := range roots {
		p := filepath.Join(root, "desktop-wails", "scripts", "window-audio-worker.mjs")
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, nil
		}
	}
	return "", fmt.Errorf("window-audio-worker.mjs not found")
}

func repoRoots() []string {
	var out []string
	if r := os.Getenv("MAKA_REPO_ROOT"); r != "" {
		out = append(out, r)
	}
	if wd, err := os.Getwd(); err == nil {
		out = append(out, wd, filepath.Join(wd, ".."), filepath.Join(wd, "..", ".."))
	}
	return out
}

func nodeBin() string {
	if p, err := exec.LookPath("node"); err == nil {
		return p
	}
	return "node"
}

func nodePathEnv(repoRoot string) string {
	parts := []string{
		filepath.Join(repoRoot, "node_modules"),
	}
	return "NODE_PATH=" + strings.Join(parts, string(os.PathListSeparator))
}