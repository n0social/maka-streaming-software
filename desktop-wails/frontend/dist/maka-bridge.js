/**
 * MakaLight — replaces Electron preload for Wails.
 * Implements a subset of MakaBridge; browser APIs are omitted (studio-only).
 */
;(function () {
  const go = () => window.go?.main?.App
  const rt = () => window.runtime

  const rejected = (name) =>
    Promise.reject(new Error(`MakaLight: ${name} not implemented yet`))

  const noopUnsub = () => {}

  const promisify = (fn) => {
    if (!fn) return () => rejected('backend')
    return (...args) => {
      const result = fn.apply(go(), args)
      return result && typeof result.then === 'function' ? result : Promise.resolve(result)
    }
  }

  const eventsOn = (name, cb) => {
    const runtime = rt()
    if (!runtime?.EventsOn) return noopUnsub
    return runtime.EventsOn(name, cb)
  }

  window.maka = {
    getVersionInfo: promisify(() => go()?.GetVersionInfo()),
    getRelay: promisify(() => go()?.GetRelay()),
    startRelay: promisify(() => go()?.StartRelay()),
    stopRelay: promisify(() => go()?.StopRelay()),
    refreshRelay: promisify(() => go()?.RefreshRelay()),
    publishWhipOffer: (sdp, token) => promisify(() => go()?.PublishWhipOffer(sdp, token))(),
    closeWhipResource: (resourceUrl, token) =>
      promisify(() => go()?.CloseWhipResource({ resourceUrl, token }))().then(() => undefined),
    onRelayUpdate: (cb) => eventsOn('relay:update', cb),
    getMode: promisify(() => go()?.GetMode()),
    getWorkspaceMode: promisify(() => go()?.GetWorkspaceMode()),
    setMode: promisify((mode) => go()?.SetMode(mode)),
    exitSettingsMode: promisify(() => go()?.ExitSettingsMode()),
    onMode: (cb) => eventsOn('app:mode', cb),
    getSettings: promisify(() => go()?.GetSettings()),
    setSettings: promisify((partial) => go()?.SetSettings(partial)),
    listCaptureSources: promisify(() => go()?.ListCaptureSources()),
    windowMinimize: promisify(() => go()?.WindowMinimize()),
    windowMaximize: promisify(() => go()?.WindowMaximize()),
    windowClose: promisify(() => go()?.WindowClose()),
    openExternal: promisify((url) => go()?.OpenExternal(url)),
    openStream: promisify(() => go()?.OpenStream()),
    openHome: promisify(() => go()?.OpenHome()),

    // Browser / Search tab — not in MakaLight (studio-only).
    navigate: () => rejected('navigate'),
    back: () => rejected('back'),
    forward: () => rejected('forward'),
    reload: () => rejected('reload'),
    getBrowserState: () =>
      Promise.resolve({ url: '', title: '', canGoBack: false, canGoForward: false }),
    listTabs: () => Promise.resolve([]),
    newTab: () => Promise.resolve(null),
    activateTab: () => Promise.resolve([]),
    closeTab: () => Promise.resolve([]),
    openPinned: () => Promise.resolve([]),
    popoutChat: () => Promise.resolve(),
    getBrowseCaptureTarget: () => Promise.resolve(null),
    setBrowseCaptureActive: () => Promise.resolve(false),
    onNavigated: () => noopUnsub,
    onTitle: () => noopUnsub,
    onTabs: () => noopUnsub,

    // Stubs — phased Go bindings.
    getPlatformViewers: () => rejected('getPlatformViewers'),
    publishPlatformMetadata: () => rejected('publishPlatformMetadata'),
    revealRelay: () => rejected('revealRelay'),
    startWindowAudio: () => rejected('startWindowAudio'),
    stopWindowAudio: () => Promise.resolve(),
    onWindowAudioPcm: () => noopUnsub,
    setPreferredCaptureSource: () => Promise.resolve(),
    listAddonPanels: () => Promise.resolve([]),
    listMarketplace: () => Promise.resolve([]),
    refreshMarketplace: () => Promise.resolve([]),
    installAddon: () => rejected('installAddon'),
    uninstallAddon: () => rejected('uninstallAddon'),
    setAddonEnabled: () => rejected('setAddonEnabled'),
    reloadAddons: () => Promise.resolve([]),
    getAddonSettings: () => Promise.resolve({}),
    setAddonSettings: () => Promise.resolve({}),
    runAddonLiveEvents: () => Promise.resolve([]),
    runAddonAction: () => rejected('runAddonAction'),
    getAddonPreloadPath: () => Promise.resolve(''),
    listDiagnostics: () => Promise.resolve([]),
    recordDiagnostic: () => Promise.resolve(),
    clearDiagnostics: () => Promise.resolve([]),
    exportDiagnostics: () => rejected('exportDiagnostics'),
    exportQosBundle: () => rejected('exportQosBundle'),
    verifySystem: () => rejected('verifySystem'),
    onDiagnostic: () => noopUnsub,
    pickRecordingFolder: () => rejected('pickRecordingFolder'),
    saveRecording: () => rejected('saveRecording'),
    pickSceneImageFile: () => rejected('pickSceneImageFile'),
    readSceneImageDataUrl: () => Promise.resolve(null),
    listGpuOptions: () => Promise.resolve([]),
    getVcamCapability: () => Promise.resolve({ supported: false }),
    openVcamOutput: () => Promise.resolve(),
    closeVcamOutput: () => Promise.resolve(),
    pushVcamFrame: () => {},
    onVcamFrame: () => noopUnsub,
    getLayoutMetrics: () => Promise.resolve({ width: 0, height: 0 }),
    onPrepareQuit: () => noopUnsub,
    ackPrepareQuit: () => {},
    getUpdateStatus: () =>
      Promise.resolve({ status: 'idle', version: null, percent: null, error: null }),
    checkForUpdates: () =>
      Promise.resolve({ status: 'idle', version: null, percent: null, error: null }),
    downloadUpdate: () =>
      Promise.resolve({ status: 'idle', version: null, percent: null, error: null }),
    installUpdate: () => Promise.resolve(),
    onUpdateStatus: () => noopUnsub,
    getPhonePair: () => rejected('getPhonePair'),
    onPhonePairUpdate: () => noopUnsub,
    onPhoneWebrtcOffer: () => noopUnsub,
    onPhoneWebrtcReset: () => noopUnsub,
    submitPhoneWebrtcAnswer: () => rejected('submitPhoneWebrtcAnswer'),
    getPhoneWebRtcIceServers: () => Promise.resolve([]),
  }

  document.documentElement.dataset.makalight = '1'
})()