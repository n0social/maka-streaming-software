package relay

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	DefaultPort    = 38473
	BaseURL        = "http://127.0.0.1:38473"
	HealthPath     = "/health"
	StatusPath     = "/status"
	StopPath       = "/stop"
	WhipURL        = BaseURL + "/whip"
	OpenVersion    = "0.1.1"
	pollInterval   = 1500 * time.Millisecond
	requestTimeout = 4 * time.Second
)

// Snapshot mirrors src/shared/relay-snapshot.ts for the studio UI.
type Snapshot struct {
	Lifecycle string `json:"lifecycle"`
	Health    any    `json:"health"`
	Status    any    `json:"status"`
	Error     any    `json:"error"`
	Pid       any    `json:"pid"`
	Restarts  int    `json:"restarts,omitempty"`
}

type Manager struct {
	mu      sync.Mutex
	cmd     *exec.Cmd
	repoRoot string
	relayRoot string
	entry   string
	snapshot Snapshot
	client  *http.Client
}

func NewManager() (*Manager, error) {
	entry, relayRoot, repoRoot, err := resolveRelayPaths()
	if err != nil {
		return &Manager{
			snapshot: Snapshot{
				Lifecycle: "stopped",
				Error:     err.Error(),
			},
			client: &http.Client{Timeout: requestTimeout},
		}, nil
	}
	return &Manager{
		entry:     entry,
		relayRoot: relayRoot,
		repoRoot:  repoRoot,
		snapshot:  Snapshot{Lifecycle: "stopped"},
		client:    &http.Client{Timeout: requestTimeout},
	}, nil
}

func (m *Manager) EntryPath() string {
	if m == nil {
		return ""
	}
	return m.entry
}

func resolveRelayPaths() (entry, relayRoot, repoRoot string, err error) {
	candidates := []string{}
	if root := os.Getenv("MAKA_REPO_ROOT"); root != "" {
		candidates = append(candidates, root)
	}
	if wd, e := os.Getwd(); e == nil {
		dir := filepath.Clean(wd)
		for i := 0; i < 8; i++ {
			candidates = append(candidates, dir)
			dir = filepath.Clean(filepath.Join(dir, ".."))
		}
	}
	if exe, e := os.Executable(); e == nil {
		dir := filepath.Clean(filepath.Dir(exe))
		for i := 0; i < 6; i++ {
			candidates = append(candidates, dir)
			dir = filepath.Clean(filepath.Join(dir, ".."))
		}
	}
	seen := map[string]bool{}
	if exe, e := os.Executable(); e == nil {
		exeRoot := filepath.Clean(filepath.Dir(exe))
		entryPath := filepath.Join(exeRoot, "relay", "src", "index.mjs")
		if st, err := os.Stat(entryPath); err == nil && !st.IsDir() {
			return entryPath, filepath.Join(exeRoot, "relay"), exeRoot, nil
		}
	}
	for _, root := range candidates {
		root = filepath.Clean(root)
		if seen[root] {
			continue
		}
		seen[root] = true
		entryPath := filepath.Join(root, "relay", "src", "index.mjs")
		if st, e := os.Stat(entryPath); e == nil && !st.IsDir() {
			return entryPath, filepath.Join(root, "relay"), root, nil
		}
	}
	return "", "", "", errors.New("open MAKA.relay not found (set MAKA_REPO_ROOT or run beside relay/)")
}

func (m *Manager) GetSnapshot() Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshot
}

func (m *Manager) Start(ctx context.Context) error {
	m.mu.Lock()
	if m.entry == "" {
		msg := "open MAKA.relay not found — reinstall with MakaLight-amd64-installer.exe (relay folder beside MakaLight.exe) or set MAKA_REPO_ROOT"
		m.snapshot = Snapshot{Lifecycle: "stopped", Error: msg}
		m.mu.Unlock()
		return errors.New(msg)
	}
	if m.cmd != nil && m.cmd.Process != nil {
		err := m.refreshLocked(ctx)
		m.mu.Unlock()
		return err
	}
	node, nodeErr := resolveNodeBin()
	if nodeErr != nil {
		m.snapshot = Snapshot{Lifecycle: "stopped", Error: nodeErr.Error()}
		m.mu.Unlock()
		return nodeErr
	}
	cmd := exec.CommandContext(ctx, node, m.entry)
	cmd.Dir = m.relayRoot
	cmd.Env = append(os.Environ(),
		"MAKA_NO_OPEN=1",
		"MAKA_STREAM_URL="+WhipURL,
		"MAKA_RELAY_ROOT="+m.relayRoot,
		"RELAY_VERSION="+OpenVersion,
		"NODE_PATH="+nodeModulesPath(m.relayRoot, m.repoRoot),
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	configureRelayChildProcess(cmd)
	if err := cmd.Start(); err != nil {
		m.snapshot = Snapshot{Lifecycle: "stopped", Error: err.Error()}
		m.mu.Unlock()
		return err
	}
	m.cmd = cmd
	pid := cmd.Process.Pid
	m.snapshot = Snapshot{Lifecycle: "starting", Pid: pid}
	go m.waitProcess(cmd)
	m.mu.Unlock()
	return m.pollUntilHealthy(ctx)
}

func nodeModulesPath(relayRoot, repoRoot string) string {
	parts := []string{}
	for _, p := range []string{
		filepath.Join(relayRoot, "node_modules"),
		filepath.Join(repoRoot, "node_modules"),
	} {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			parts = append(parts, p)
		}
	}
	return strings.Join(parts, string(os.PathListSeparator))
}

func (m *Manager) waitProcess(cmd *exec.Cmd) {
	err := cmd.Wait()
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cmd == cmd {
		m.cmd = nil
		msg := "relay exited"
		if err != nil {
			msg = err.Error()
		}
		m.snapshot = Snapshot{Lifecycle: "stopped", Error: msg}
	}
}

func (m *Manager) Stop(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	_ = postJSON(ctx, m.client, BaseURL+StopPath, nil)
	if m.cmd != nil && m.cmd.Process != nil {
		_ = m.cmd.Process.Kill()
	}
	m.cmd = nil
	m.snapshot = Snapshot{Lifecycle: "stopped"}
	return nil
}

func (m *Manager) Refresh(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.refreshLocked(ctx)
}

func (m *Manager) refreshLocked(ctx context.Context) error {
	health, err := fetchJSON(ctx, m.client, BaseURL+HealthPath)
	if err != nil {
		if m.cmd != nil {
			m.snapshot = Snapshot{
				Lifecycle: "starting",
				Error:     err.Error(),
				Pid:       pidOrNil(m.cmd),
			}
		} else {
			m.snapshot = Snapshot{Lifecycle: "stopped", Error: err.Error()}
		}
		return err
	}
	status, _ := fetchJSON(ctx, m.client, BaseURL+StatusPath)
	health = localizeRelayHealth(health)
	lifecycle := lifecycleFromRelayStatus(status, m.cmd != nil)
	snapErr := relayStatusError(status)
	m.snapshot = Snapshot{
		Lifecycle: lifecycle,
		Health:    health,
		Status:    status,
		Error:     snapErr,
		Pid:       pidOrNil(m.cmd),
	}
	return nil
}

func localizeRelayHealth(health any) any {
	hmap, ok := health.(map[string]any)
	if !ok {
		return health
	}
	hmap["streamUrl"] = WhipURL
	return hmap
}

func lifecycleFromRelayStatus(status any, processUp bool) string {
	smap, ok := status.(map[string]any)
	if !ok {
		if processUp {
			return "ready"
		}
		return "ready"
	}
	st, _ := smap["status"].(string)
	switch st {
	case "live":
		return "live"
	case "error":
		return "error"
	case "starting":
		return "starting"
	default:
		return "ready"
	}
}

func relayStatusError(status any) any {
	smap, ok := status.(map[string]any)
	if !ok {
		return nil
	}
	st, _ := smap["status"].(string)
	if st != "error" {
		return nil
	}
	if msg, ok := smap["error"].(string); ok && msg != "" {
		return msg
	}
	return nil
}

func pidOrNil(cmd *exec.Cmd) any {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return cmd.Process.Pid
}

func (m *Manager) pollUntilHealthy(ctx context.Context) error {
	deadline := time.Now().Add(20 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		m.mu.Lock()
		err := m.refreshLocked(ctx)
		m.mu.Unlock()
		if err == nil {
			return nil
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(pollInterval):
		}
	}
	m.mu.Lock()
	if m.cmd != nil {
		msg := "relay health timeout"
		if lastErr != nil {
			msg = fmt.Sprintf("%s (%v)", msg, lastErr)
		}
		m.snapshot.Lifecycle = "starting"
		if m.snapshot.Error == nil || m.snapshot.Error == "" {
			m.snapshot.Error = msg
		}
	}
	m.mu.Unlock()
	return errors.New("relay health timeout")
}

func (m *Manager) FetchHealthToken(ctx context.Context) (string, error) {
	health, err := fetchJSON(ctx, m.client, BaseURL+HealthPath)
	if err != nil {
		return "", err
	}
	hmap, ok := health.(map[string]any)
	if !ok {
		return "", errors.New("invalid health json")
	}
	tok, _ := hmap["relayToken"].(string)
	tok = strings.TrimSpace(tok)
	if tok == "" {
		return "", errors.New("relay token missing from /health")
	}
	return tok, nil
}

func (m *Manager) PublishWhip(ctx context.Context, offerSdp string) (answerSdp string, resourceURL string, err error) {
	token, err := m.FetchHealthToken(ctx)
	if err != nil {
		return "", "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, WhipURL, strings.NewReader(offerSdp))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/sdp")
	req.Header.Set("Accept", "application/sdp")
	req.Header.Set("Authorization", "Bearer "+token)
	whipClient := &http.Client{Timeout: 25 * time.Second}
	res, err := whipClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", "", fmt.Errorf("WHIP publish failed (%d): %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	loc := res.Header.Get("Location")
	if loc != "" {
		if strings.HasPrefix(loc, "http") {
			resourceURL = loc
		} else {
			resourceURL = WhipURL + loc
		}
	}
	return string(body), resourceURL, nil
}

func (m *Manager) CloseWhipResource(ctx context.Context, resourceURL string) error {
	resourceURL = strings.TrimSpace(resourceURL)
	if resourceURL == "" {
		return nil
	}
	token, err := m.FetchHealthToken(ctx)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, resourceURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := m.client.Do(req)
	if err != nil {
		return err
	}
	res.Body.Close()
	return nil
}

func fetchJSON(ctx context.Context, client *http.Client, url string) (any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("%s → HTTP %d", url, res.StatusCode)
	}
	var payload any
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func postJSON(ctx context.Context, client *http.Client, url string, body any) error {
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	res.Body.Close()
	return nil
}

func resolveNodeBin() (string, error) {
	if exe, err := os.Executable(); err == nil {
		bundled := filepath.Join(filepath.Dir(exe), "node", "node.exe")
		if st, e := os.Stat(bundled); e == nil && !st.IsDir() {
			return bundled, nil
		}
	}
	for _, name := range []string{"node", "node.exe"} {
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}
	return "", errors.New("Node.js runtime not found — reinstall MakaLight-amd64-installer.exe (includes node\\node.exe next to MakaLight.exe)")
}

func nodeBinForRelay() string {
	if p, err := resolveNodeBin(); err == nil {
		return p
	}
	return "node"
}

// LaunchContext surfaces install-layout hints for diagnostics (VerifySystem / support).
func (m *Manager) LaunchContext() map[string]string {
	out := map[string]string{
		"entry":     m.entry,
		"relayRoot": m.relayRoot,
	}
	if exe, err := os.Executable(); err == nil {
		out["exeDir"] = filepath.Dir(exe)
	}
	if p, err := resolveNodeBin(); err == nil {
		out["nodeBin"] = p
	} else {
		out["nodeError"] = err.Error()
	}
	return out
}