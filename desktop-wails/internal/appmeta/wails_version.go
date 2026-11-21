package appmeta

import (
	_ "embed"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

//go:embed product_version.txt
var embeddedProductVersion string

var (
	productOnce sync.Once
	productVer  string
)

// MakaLightProductVersion is the studio app version (from product_version.txt / wails.json at build).
func MakaLightProductVersion() string {
	productOnce.Do(func() {
		productVer = readMakaLightProductVersion()
	})
	return productVer
}

func readMakaLightProductVersion() string {
	if v := strings.TrimSpace(embeddedProductVersion); v != "" {
		return v
	}
	if exe, err := os.Executable(); err == nil {
		for _, path := range []string{
			filepath.Join(filepath.Dir(exe), "wails.json"),
			filepath.Join(filepath.Dir(exe), "..", "wails.json"),
		} {
			var meta struct {
				Info struct {
					ProductVersion string `json:"productVersion"`
				} `json:"info"`
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			if json.Unmarshal(raw, &meta) == nil && meta.Info.ProductVersion != "" {
				return meta.Info.ProductVersion
			}
		}
	}
	return "0.0.0"
}