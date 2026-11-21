package sceneimage

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
)

const maxImageBytes = 25 * 1024 * 1024

func MimeForPath(filePath string) (string, bool) {
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".png":
		return "image/png", true
	case ".jpg", ".jpeg":
		return "image/jpeg", true
	default:
		return "", false
	}
}

func ReadDataURL(filePath string) (string, bool) {
	filePath = strings.TrimSpace(filePath)
	if filePath == "" {
		return "", false
	}
	mime, ok := MimeForPath(filePath)
	if !ok {
		return "", false
	}
	buf, err := os.ReadFile(filePath)
	if err != nil || len(buf) == 0 || len(buf) > maxImageBytes {
		return "", false
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(buf), true
}