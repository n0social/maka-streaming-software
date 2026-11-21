package main

// Browser and studio stubs return Electron-shaped empties until each ipcMain handler is ported 1:1.

func (a *App) BrowserNavigate(url string) any    { return nil }
func (a *App) BrowserBack()                      {}
func (a *App) BrowserForward()                   {}
func (a *App) BrowserReload()                    {}
func (a *App) BrowserState() map[string]any      { return map[string]any{"url": "", "title": "", "canGoBack": false, "canGoForward": false} }
func (a *App) BrowserTabs() []any                { return []any{} }
func (a *App) BrowserNewTab(url string) any      { return nil }
func (a *App) BrowserActivateTab(id string) []any { return []any{} }
func (a *App) BrowserCloseTab(id string) []any    { return []any{} }
func (a *App) BrowserOpenPinned(presetId string) []any { return []any{} }
func (a *App) BrowserPopoutChat(url string)      {}
func (a *App) GetBrowseCaptureTarget() any       { return nil }
func (a *App) SetBrowseCaptureActive(active bool) bool { return false }

func (a *App) GetPlatformViewers(query map[string]any) map[string]any {
	return map[string]any{"twitch": nil, "youtube": nil}
}
func (a *App) PublishPlatformMetadata() map[string]any { return map[string]any{} }
func (a *App) RevealRelay() string                        { return "" }
func (a *App) StartWindowAudio(sourceId string) error     { return nil }
func (a *App) StopWindowAudio()                           {}
func (a *App) GetVcamCapability() map[string]any          { return map[string]any{"supported": false} }
func (a *App) OpenVcamOutput()                              {}
func (a *App) CloseVcamOutput()                             {}
func (a *App) PushVcamFrame(dataUrl string)               {}
func (a *App) ListGpuOptions() []any                        { return []any{} }
func (a *App) PickRecordingFolder() map[string]any        { return map[string]any{"canceled": true} }
func (a *App) ListAddonPanels() []any                       { return []any{} }
func (a *App) ListMarketplace() []any                       { return []any{} }
func (a *App) RefreshMarketplace()                        {}
func (a *App) InstallAddon(catalogId string) error          { return nil }
func (a *App) UninstallAddon(addonId string) error          { return nil }
func (a *App) SetAddonEnabled(addonId string, enabled bool) error { return nil }
func (a *App) ReloadAddons() []any                          { return []any{} }
func (a *App) GetAddonPreloadPath() string                  { return "" }
func (a *App) GetAddonSettings(addonId string) map[string]any { return map[string]any{} }
func (a *App) SetAddonSettings(addonId string, partial map[string]any) map[string]any { return partial }
func (a *App) DispatchAddonLiveEvent(event map[string]any, ctx map[string]any) []any { return []any{} }
func (a *App) RunAddonAction(addonId, actionId string, ctx map[string]any) map[string]any {
	return map[string]any{"ok": false}
}
func (a *App) ListDiagnostics() []any   { return []any{} }
func (a *App) RecordDiagnostic(event map[string]any) {}
func (a *App) ClearDiagnostics() []any { return []any{} }
func (a *App) ExportDiagnostics() string { return "" }
func (a *App) ExportQosBundle(snapshot map[string]any) map[string]any {
	return map[string]any{"ok": false}
}
func (a *App) VerifySystem() map[string]any { return map[string]any{} }
func (a *App) PickSceneImageFile() map[string]any { return map[string]any{"canceled": true} }
func (a *App) ReadSceneImageDataUrl(filePath string) any { return nil }
func (a *App) SaveRecording(payload map[string]any) map[string]any { return map[string]any{"canceled": true} }
func (a *App) AckPrepareQuit() {}
func (a *App) GetUpdateStatus() map[string]any {
	return map[string]any{"status": "idle", "version": nil, "percent": nil, "error": nil}
}
func (a *App) CheckForUpdates() map[string]any  { return a.GetUpdateStatus() }
func (a *App) DownloadUpdate() map[string]any { return a.GetUpdateStatus() }
func (a *App) InstallUpdate()                   {}
func (a *App) GetPhonePair() map[string]any     { return map[string]any{} }
func (a *App) SubmitPhoneWebrtcAnswer(answer map[string]any) map[string]any { return map[string]any{"ok": false} }
func (a *App) GetPhoneWebRtcIceServers() []any  { return []any{} }