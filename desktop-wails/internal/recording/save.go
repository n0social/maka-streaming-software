package recording

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
)

const maxRecordingBytes = 2 * 1024 * 1024 * 1024

type SaveOptions struct {
	SaveFolder  string
	ForceDialog bool
}

func DefaultName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "maka-recording.webm"
	}
	if len(name) > 200 {
		return name[:200]
	}
	return name
}

func NormalizeExt(ext string) string {
	if ext == "mp4" {
		return "mp4"
	}
	return "webm"
}

func ShouldUseSaveDialog(saveFolder string, forceDialog bool) bool {
	if forceDialog {
		return true
	}
	folder := strings.TrimSpace(saveFolder)
	if folder == "" {
		return true
	}
	info, err := os.Stat(folder)
	return err != nil || !info.IsDir()
}

func ResolveDefaultSavePath(defaultName, saveFolder string) string {
	folder := strings.TrimSpace(saveFolder)
	if folder != "" {
		if info, err := os.Stat(folder); err == nil && info.IsDir() {
			return filepath.Join(folder, defaultName)
		}
	}
	return defaultName
}

func WriteFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func BytesFromBridgeValue(raw any) ([]byte, bool) {
	switch v := raw.(type) {
	case []byte:
		if len(v) == 0 || len(v) > maxRecordingBytes {
			return nil, false
		}
		return v, true
	case string:
		b, err := base64.StdEncoding.DecodeString(v)
		if err != nil || len(b) == 0 || len(b) > maxRecordingBytes {
			return nil, false
		}
		return b, true
	case []any:
		out := make([]byte, len(v))
		for i, x := range v {
			n, ok := x.(float64)
			if !ok {
				return nil, false
			}
			out[i] = byte(n)
		}
		if len(out) == 0 || len(out) > maxRecordingBytes {
			return nil, false
		}
		return out, true
	default:
		return nil, false
	}
}