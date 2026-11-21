package appmeta

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

var (
	once    sync.Once
	version string
)

// AppVersion is kept for diagnostics; studio UI should use MakaLightProductVersion().
func AppVersion() string {
	once.Do(func() {
		version = readPackageVersion()
	})
	return version
}

func readPackageVersion() string {
	candidates := []string{}
	if root := os.Getenv("MAKA_REPO_ROOT"); root != "" {
		candidates = append(candidates, filepath.Join(root, "package.json"))
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(wd, "package.json"),
			filepath.Join(wd, "..", "package.json"),
			filepath.Join(wd, "..", "..", "package.json"),
		)
	}
	for _, path := range candidates {
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var meta struct {
			Version string `json:"version"`
		}
		if json.Unmarshal(raw, &meta) == nil && meta.Version != "" {
			return meta.Version
		}
	}
	return "0.0.0"
}