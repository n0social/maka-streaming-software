/**
 * 1:1 MakaBridge surface from src/preload/index.ts — binds to Wails go.main.App where implemented.
 */
;(function () {
  const go = () => window.go?.main?.App
  const rt = () => window.runtime

  const rejectUnimplemented = (channel) =>
    Promise.reject(new Error(`Unhandled studio bridge: ${channel}`))

  const noopUnsub = () => {}

  const bind = (method, ...args) => {
    const app = go()
    if (!app || typeof app[method] !== 'function') return rejectUnimplemented(method)
    const out = app[method](...args)
    return out && typeof out.then === 'function' ? out : Promise.resolve(out)
  }

  const eventsOn = (name, cb) => {
    const runtime = rt()
    if (!runtime?.EventsOn) return noopUnsub
    return runtime.EventsOn(name, cb)
  }

  const emptyBrowserState = () => ({
    url: '',
    title: '',
    canGoBack: false,
    canGoForward: false,
  })

  const api = {
    getPlatformViewers: (query) => bind('GetPlatformViewers', query),
    getRelay: () => bind('GetRelay'),
    publishPlatformMetadata: () => bind('PublishPlatformMetadata'),
    startRelay: () => bind('StartRelay'),
    stopRelay: () => bind('StopRelay'),
    refreshRelay: () => bind('RefreshRelay'),
    publishWhipOffer: (sdp, relayToken) => bind('PublishWhipOffer', sdp, relayToken),
    closeWhipResource: (resourceUrl, relayToken) =>
      bind('CloseWhipResource', { resourceUrl, token: relayToken }).then(() => undefined),
    onRelayUpdate: (cb) => eventsOn('relay:update', cb),
    getMode: () => bind('GetMode'),
    getWorkspaceMode: () => bind('GetWorkspaceMode'),
    setMode: (mode) => bind('SetMode', mode),
    exitSettingsMode: () => bind('ExitSettingsMode'),
    getVersionInfo: () => bind('GetVersionInfo'),
    getVcamCapability: () => bind('GetVcamCapability'),
    openVcamOutput: () => bind('OpenVcamOutput'),
    closeVcamOutput: () => bind('CloseVcamOutput'),
    pushVcamFrame: (dataUrl) => bind('PushVcamFrame', dataUrl),
    onVcamFrame: (cb) => eventsOn('vcam:frame', cb),
    listGpuOptions: () => bind('ListGpuOptions'),
    pickRecordingFolder: () => bind('PickRecordingFolder'),
    onMode: (cb) => eventsOn('app:mode', cb),
    navigate: (url) => bind('BrowserNavigate', url),
    back: () => bind('BrowserBack'),
    forward: () => bind('BrowserForward'),
    reload: () => bind('BrowserReload'),
    getBrowserState: () => bind('BrowserState').catch(() => emptyBrowserState()),
    onNavigated: (cb) => eventsOn('browser:navigated', cb),
    onTitle: (cb) => eventsOn('browser:title', cb),
    listCaptureSources: () => bind('ListCaptureSources'),
    startWindowAudio: (sourceId) => bind('StartWindowAudio', sourceId),
    stopWindowAudio: () => bind('StopWindowAudio'),
    onWindowAudioPcm: (cb) => eventsOn('window-audio:pcm', cb),
    setPreferredCaptureSource: (sourceId) => bind('SetPreferredCaptureSource', sourceId),
    getBrowseCaptureTarget: () => bind('GetBrowseCaptureTarget'),
    setBrowseCaptureActive: (active) => bind('SetBrowseCaptureActive', active),
    listAddonPanels: () => bind('ListAddonPanels'),
    listMarketplace: () => bind('ListMarketplace'),
    refreshMarketplace: () => bind('RefreshMarketplace'),
    installAddon: (catalogId) => bind('InstallAddon', catalogId),
    uninstallAddon: (addonId) => bind('UninstallAddon', addonId),
    setAddonEnabled: (addonId, enabled) => bind('SetAddonEnabled', addonId, enabled),
    reloadAddons: () => bind('ReloadAddons'),
    getAddonPreloadPath: () => bind('GetAddonPreloadPath'),
    onAddonStudioToast: (cb) => eventsOn('addon-runtime:studio-toast', cb),
    getAddonSettings: (addonId) => bind('GetAddonSettings', addonId),
    setAddonSettings: (addonId, partial) => bind('SetAddonSettings', addonId, partial),
    dispatchAddonLiveEvent: (event, ctx) => bind('DispatchAddonLiveEvent', event, ctx),
    runAddonAction: (addonId, actionId, ctx) => bind('RunAddonAction', addonId, actionId, ctx),
    revealRelay: () => bind('RevealRelay'),
    listDiagnostics: () => bind('ListDiagnostics'),
    recordDiagnostic: (event) => bind('RecordDiagnostic', event),
    clearDiagnostics: () => bind('ClearDiagnostics'),
    exportDiagnostics: () => bind('ExportDiagnostics'),
    exportQosBundle: (snapshot) => bind('ExportQosBundle', snapshot),
    verifySystem: () => bind('VerifySystem'),
    onDiagnostic: (cb) => eventsOn('diagnostics:event', cb),
    listTabs: () => bind('BrowserTabs'),
    newTab: (url) => bind('BrowserNewTab', url),
    activateTab: (id) => bind('BrowserActivateTab', id),
    closeTab: (id) => bind('BrowserCloseTab', id),
    openPinned: (presetId) => bind('BrowserOpenPinned', presetId),
    onTabs: (cb) => eventsOn('browser:tabs', cb),
    popoutChat: (url) => bind('BrowserPopoutChat', url),
    getSettings: () => bind('GetSettings'),
    setSettings: (partial) => bind('SetSettings', partial),
    openExternal: (url) => bind('OpenExternal', url),
    pickSceneImageFile: () => bind('PickSceneImageFile'),
    readSceneImageDataUrl: (filePath) => bind('ReadSceneImageDataUrl', filePath),
    saveRecording: (payload) => bind('SaveRecording', payload),
    windowMinimize: () => bind('WindowMinimize'),
    windowMaximize: () => bind('WindowMaximize'),
    windowClose: () => bind('WindowClose'),
    openStream: () => bind('OpenStream'),
    openHome: () => bind('OpenHome'),
    onPrepareQuit: (cb) => eventsOn('app:prepare-quit', cb),
    ackPrepareQuit: () => bind('AckPrepareQuit'),
    getUpdateStatus: () => bind('GetUpdateStatus'),
    checkForUpdates: () => bind('CheckForUpdates'),
    downloadUpdate: () => bind('DownloadUpdate'),
    installUpdate: () => bind('InstallUpdate'),
    onUpdateStatus: (cb) => eventsOn('app:update-status', cb),
    getPhonePair: () => bind('GetPhonePair'),
    onPhonePairUpdate: (cb) => eventsOn('phone-pair:update', cb),
    onPhoneWebrtcOffer: (cb) => eventsOn('phone-pair:webrtc-offer', cb),
    onPhoneWebrtcReset: (cb) => eventsOn('phone-pair:webrtc-reset', cb),
    submitPhoneWebrtcAnswer: (answer) => bind('SubmitPhoneWebrtcAnswer', answer),
    getPhoneWebRtcIceServers: () => bind('GetPhoneWebRtcIceServers'),
  }

  window.maka = api
  window.tabcast = api
})()