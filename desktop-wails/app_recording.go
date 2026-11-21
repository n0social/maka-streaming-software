package main

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/n0social/maka-streaming-software/desktop-wails/internal/recording"
	"github.com/n0social/maka-streaming-software/desktop-wails/internal/sceneimage"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func canceled() map[string]any { return map[string]any{"canceled": true} }

func saved(path string) map[string]any {
	return map[string]any{"canceled": false, "filePath": path}
}

// PickSceneImageFile — ipc scene:pick-image.
func (a *App) PickSceneImageFile() map[string]any {
	if a.ctx == nil {
		return canceled()
	}
	path, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Choose scene image",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "Images", Pattern: "*.png;*.jpg;*.jpeg"},
		},
	})
	if err != nil || strings.TrimSpace(path) == "" {
		return canceled()
	}
	dataURL, ok := sceneimage.ReadDataURL(path)
	if !ok {
		return canceled()
	}
	return map[string]any{
		"canceled": false,
		"path":     path,
		"dataUrl":  dataURL,
	}
}

// ReadSceneImageDataUrl — ipc scene:read-image-data-url.
func (a *App) ReadSceneImageDataUrl(filePath string) any {
	if dataURL, ok := sceneimage.ReadDataURL(filePath); ok {
		return dataURL
	}
	return nil
}

// PickRecordingFolder — ipc recording:pick-folder.
func (a *App) PickRecordingFolder() map[string]any {
	if a.ctx == nil {
		return canceled()
	}
	path, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Choose recording folder",
	})
	if err != nil || strings.TrimSpace(path) == "" {
		return canceled()
	}
	return map[string]any{"canceled": false, "path": path}
}

// SaveRecording — ipc recording:save.
func (a *App) SaveRecording(payload map[string]any) map[string]any {
	if a.ctx == nil || payload == nil {
		return canceled()
	}
	bytes, okBytes := recording.BytesFromBridgeValue(payload["data"])
	if !okBytes {
		return canceled()
	}
	defaultName := recording.DefaultName(strVal(payload["defaultName"]))
	ext := recording.NormalizeExt(strVal(payload["ext"]))
	forceDialog := payload["forceDialog"] == true

	settings := a.settings.Get()
	saveFolder := strVal(settings["recordingSaveFolder"])

	if !recording.ShouldUseSaveDialog(saveFolder, forceDialog) {
		outPath := filepath.Join(strings.TrimSpace(saveFolder), defaultName)
		if err := recording.WriteFile(outPath, bytes); err != nil {
			return canceled()
		}
		return saved(outPath)
	}

	defaultPath := recording.ResolveDefaultSavePath(defaultName, saveFolder)
	filters := []wailsruntime.FileFilter{{DisplayName: "WebM video", Pattern: "*.webm"}}
	if ext == "mp4" {
		filters = []wailsruntime.FileFilter{{DisplayName: "MP4 video", Pattern: "*.mp4"}}
	}

	saveOpts := wailsruntime.SaveDialogOptions{
		Title:           "Save recording",
		DefaultFilename: filepath.Base(defaultPath),
		Filters:         filters,
	}
	if dir := filepath.Dir(defaultPath); dir != "" && dir != "." {
		if st, err := os.Stat(dir); err == nil && st.IsDir() {
			saveOpts.DefaultDirectory = dir
		}
	}

	path, err := wailsruntime.SaveFileDialog(a.ctx, saveOpts)
	if err != nil || strings.TrimSpace(path) == "" {
		return canceled()
	}
	if err := recording.WriteFile(path, bytes); err != nil {
		return canceled()
	}
	return saved(path)
}

func strVal(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}