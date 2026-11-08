/**
 * Maka web studio — Settings mode (1:1 port of Electron Settings).
 *
 * Source of truth (exe):
 *   - Markup: src/renderer/app.html #settings-view
 *   - Behavior: src/renderer/settings-view.ts
 *   - Defaults: src/main/settings-store.ts → settings.json
 *
 * Web persistence (cannot write settings.json on disk):
 *   localStorage key `maka.stream.settings.v1` — JSON blob mirroring AppSettings
 *   keys used by the Settings UI.
 *
 * Shared keys (sync with live.js / Stream Info sidebar / Go Live wizard):
 *   maka.stream.streamTitle      ↔ settings.streamTitle / #stream-title-input / #set-stream-title
 *   maka.stream.streamGame       ↔ settings.streamGame / #stream-game-input / #set-stream-game
 *     (migrates legacy maka.stream.streamCategory → streamGame; empty → Just Chatting)
 *   maka.stream.bitrateProfile   ↔ settings.bitrateProfile / #cfg-profile / #set-encode-profile
 *     Default everywhere: 720p30 (matches exe settings-store).
 *
 * Mapping summary (settings.json → localStorage):
 *   minimizeToTrayWhileLive, labMode, autoCheckUpdatesOnStartup,
 *   bitrateProfile, lastStreamPlatform, streamTitle, streamGame,
 *   preferredMicDeviceId, audioMicBitrateKbps, audioDesktopBitrateKbps,
 *   videoEncoderPreference, gpuPreference, recordingSaveFolder,
 *   settingsActiveTab
 *   → stored in maka.stream.settings.v1 (same property names)
 *   + streamTitle / streamGame / bitrateProfile mirrored to shared keys above
 *   Web is Studio-only: startupMode always "studio"; Browser Mode UI removed.
 *
 * Shell hooks:
 *   window.MakaStudio.registerView('settings', { open, close, isOpen, getSettings, setSettings })
 *   CustomEvent 'maka:open-settings' / 'maka:close-settings' / 'maka:toggle-settings'
 *   CustomEvent 'maka:settings-change' { detail: settings }
 *   Click #btn-settings toggles settings mode (body[data-mode='settings'])
 */
const APP_VERSION = '0.2.4' // mirrors package.json "version"

const STORAGE_KEY = 'maka.stream.settings.v1'
/** Safe web / exe default encode profile (src/main/settings-store.ts). */
const DEFAULT_BITRATE_PROFILE = '720p30'
/** Twitch-style fallback when Game is empty. */
const DEFAULT_STREAM_GAME = 'Just Chatting'
const SHARED = {
  streamTitle: 'maka.stream.streamTitle',
  streamGame: 'maka.stream.streamGame',
  /** @deprecated migrated → streamGame */
  streamCategoryLegacy: 'maka.stream.streamCategory',
  bitrateProfile: 'maka.stream.bitrateProfile',
}

const SETTINGS_TAB_IDS = [
  'general',
  'streaming',
  'audio',
  'video',
  'recording',
  'help',
]

/** Mirror src/shared/stream-encode-profiles.ts — ids are relay `profile` keys. */
const ENCODE_PROFILES = [
  { id: '720p30', label: '720p @ 30fps · 3 Mbps', bitrateMbps: 3 },
  { id: '720p60', label: '720p @ 60fps · 4.5 Mbps', bitrateMbps: 4.5 },
  { id: '1080p30', label: '1080p @ 30fps · 4.5 Mbps', bitrateMbps: 4.5 },
  { id: '1080p60', label: '1080p @ 60fps · 6 Mbps', bitrateMbps: 6 },
  { id: '2k60', label: '2K @ 60fps · 10 Mbps', bitrateMbps: 10 },
  { id: '4k60', label: '4K @ 60fps · 16 Mbps', bitrateMbps: 16 },
]

const DEST_STORAGE_KEY = 'maka.stream.destinations.v1'

const DEFAULT_SETTINGS = {
  bitrateProfile: DEFAULT_BITRATE_PROFILE,
  startupMode: 'studio',
  minimizeToTrayWhileLive: true,
  labMode: false,
  autoCheckUpdatesOnStartup: true,
  recordingSaveFolder: '',
  settingsActiveTab: 'general',
  lastStreamPlatform: 'none',
  streamTitle: '',
  streamGame: DEFAULT_STREAM_GAME,
  preferredMicDeviceId: '',
  preferredDesktopAudioOutputDeviceId: '',
  audioMicBitrateKbps: 160,
  audioDesktopBitrateKbps: 160,
  videoEncoderPreference: 'system',
  gpuPreference: 'default',
}

/** @type {typeof DEFAULT_SETTINGS} */
let settings = { ...DEFAULT_SETTINGS }
/** @type {HTMLElement | null} */
let root = null
/** Web client always restores Studio after Settings. */
let priorMode = 'studio'
let openState = false

function isSettingsTabId(value) {
  return SETTINGS_TAB_IDS.includes(value)
}

function sanitizeTitle(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 140)
}

function sanitizeGame(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100)
  return cleaned || DEFAULT_STREAM_GAME
}

/** @deprecated use sanitizeGame */
function sanitizeCategory(raw) {
  return sanitizeGame(raw)
}

function migrateCategoryToGameStorage() {
  try {
    const game = localStorage.getItem(SHARED.streamGame)
    if (game != null && String(game).length) {
      localStorage.setItem(SHARED.streamGame, sanitizeGame(game))
      return
    }
    const legacy = localStorage.getItem(SHARED.streamCategoryLegacy)
    if (legacy != null) {
      localStorage.setItem(SHARED.streamGame, sanitizeGame(legacy))
      localStorage.removeItem(SHARED.streamCategoryLegacy)
    }
  } catch {
    /* private mode */
  }
}

function coerceSettings(raw) {
  const out = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return out

  if (typeof raw.minimizeToTrayWhileLive === 'boolean') {
    out.minimizeToTrayWhileLive = raw.minimizeToTrayWhileLive
  }
  if (typeof raw.labMode === 'boolean') out.labMode = raw.labMode
  if (typeof raw.autoCheckUpdatesOnStartup === 'boolean') {
    out.autoCheckUpdatesOnStartup = raw.autoCheckUpdatesOnStartup
  }
  if (ENCODE_PROFILES.some((p) => p.id === raw.bitrateProfile)) {
    out.bitrateProfile = raw.bitrateProfile
  }
  if (raw.lastStreamPlatform === 'twitch' || raw.lastStreamPlatform === 'youtube' || raw.lastStreamPlatform === 'none') {
    out.lastStreamPlatform = raw.lastStreamPlatform
  }
  if (typeof raw.streamTitle === 'string') out.streamTitle = sanitizeTitle(raw.streamTitle)
  if (typeof raw.streamGame === 'string') {
    out.streamGame = sanitizeGame(raw.streamGame)
  } else if (typeof raw.streamCategory === 'string') {
    out.streamGame = sanitizeGame(raw.streamCategory)
  }
  if (typeof raw.preferredMicDeviceId === 'string') out.preferredMicDeviceId = raw.preferredMicDeviceId
  if (typeof raw.preferredDesktopAudioOutputDeviceId === 'string') {
    out.preferredDesktopAudioOutputDeviceId = raw.preferredDesktopAudioOutputDeviceId
  }
  const micKbps = Number(raw.audioMicBitrateKbps)
  if ([96, 128, 160, 192, 256].includes(micKbps)) out.audioMicBitrateKbps = micKbps
  const deskKbps = Number(raw.audioDesktopBitrateKbps)
  if ([96, 128, 160, 192, 256].includes(deskKbps)) out.audioDesktopBitrateKbps = deskKbps
  if (raw.videoEncoderPreference === 'system' || raw.videoEncoderPreference === 'hardware' || raw.videoEncoderPreference === 'software') {
    out.videoEncoderPreference = raw.videoEncoderPreference
  }
  if (typeof raw.gpuPreference === 'string' && raw.gpuPreference) out.gpuPreference = raw.gpuPreference
  if (typeof raw.recordingSaveFolder === 'string') out.recordingSaveFolder = raw.recordingSaveFolder
  // Web client is Studio-only — ignore legacy browse startupMode from localStorage.
  out.startupMode = 'studio'
  if (isSettingsTabId(raw.settingsActiveTab)) out.settingsActiveTab = raw.settingsActiveTab
  return out
}

function readSharedOverrides(base) {
  const next = { ...base }
  migrateCategoryToGameStorage()
  try {
    const title = localStorage.getItem(SHARED.streamTitle)
    let game = localStorage.getItem(SHARED.streamGame)
    if (game == null) {
      const legacy = localStorage.getItem(SHARED.streamCategoryLegacy)
      if (legacy != null) game = legacy
    }
    const profile = localStorage.getItem(SHARED.bitrateProfile)
    if (title != null) next.streamTitle = sanitizeTitle(title)
    if (game != null) next.streamGame = sanitizeGame(game)
    if (profile && ENCODE_PROFILES.some((p) => p.id === profile)) next.bitrateProfile = profile
  } catch {
    /* private mode */
  }
  return next
}

function loadSettings() {
  let loaded = { ...DEFAULT_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) loaded = coerceSettings(JSON.parse(raw))
  } catch {
    loaded = { ...DEFAULT_SETTINGS }
  }
  return readSharedOverrides(loaded)
}

function persistShared(partial) {
  try {
    if (Object.prototype.hasOwnProperty.call(partial, 'streamTitle')) {
      localStorage.setItem(SHARED.streamTitle, sanitizeTitle(partial.streamTitle))
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'streamGame')) {
      localStorage.setItem(SHARED.streamGame, sanitizeGame(partial.streamGame))
      try {
        localStorage.removeItem(SHARED.streamCategoryLegacy)
      } catch {
        /* ignore */
      }
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'bitrateProfile')) {
      const id = String(partial.bitrateProfile)
      localStorage.setItem(
        SHARED.bitrateProfile,
        ENCODE_PROFILES.some((p) => p.id === id) ? id : DEFAULT_BITRATE_PROFILE,
      )
    }
  } catch {
    /* ignore */
  }
}

/** Ensure shared keys exist so Stream Info, stats bar, Settings, and wizard stay aligned. */
function ensureSharedDefaults() {
  migrateCategoryToGameStorage()
  try {
    if (localStorage.getItem(SHARED.streamGame) == null) {
      localStorage.setItem(SHARED.streamGame, DEFAULT_STREAM_GAME)
    } else {
      localStorage.setItem(SHARED.streamGame, sanitizeGame(localStorage.getItem(SHARED.streamGame)))
    }
    const profile = localStorage.getItem(SHARED.bitrateProfile)
    if (!profile || !ENCODE_PROFILES.some((p) => p.id === profile)) {
      localStorage.setItem(SHARED.bitrateProfile, DEFAULT_BITRATE_PROFILE)
    }
    if (localStorage.getItem(SHARED.streamTitle) == null) {
      localStorage.setItem(SHARED.streamTitle, '')
    }
  } catch {
    /* private mode */
  }
}

function saveSettings(partial) {
  settings = coerceSettings({ ...settings, ...partial })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
  persistShared(partial)
  syncLiveDomFields()
  dispatchChange()
  return settings
}

function dispatchChange() {
  const detail = { ...settings }
  document.dispatchEvent(new CustomEvent('maka:settings-change', { bubbles: true, detail }))
  window.dispatchEvent(new CustomEvent('maka:settings-change', { detail }))
}

function syncLiveDomFields() {
  const title = document.getElementById('stream-title-input')
  const game = document.getElementById('stream-game-input')
  const profile = document.getElementById('cfg-profile')
  const quality = document.getElementById('program-quality-select')
  const wizardQuality = document.getElementById('go-live-wizard-quality')
  const wizardTitle = document.getElementById('go-live-wizard-title-input')
  const wizardGame = document.getElementById('go-live-wizard-game-input')

  populateEncodeSelect(profile)
  populateEncodeSelect(quality)
  populateEncodeSelect(wizardQuality)

  if (title instanceof HTMLInputElement && document.activeElement !== title) {
    title.value = settings.streamTitle
  } else if (title && !(title instanceof HTMLInputElement)) {
    title.textContent = settings.streamTitle || 'Untitled stream'
  }
  if (game instanceof HTMLInputElement && document.activeElement !== game) {
    game.value = settings.streamGame || DEFAULT_STREAM_GAME
  } else if (game && !(game instanceof HTMLInputElement)) {
    game.textContent = settings.streamGame || DEFAULT_STREAM_GAME
  }
  if (wizardTitle instanceof HTMLInputElement && document.activeElement !== wizardTitle) {
    wizardTitle.value = settings.streamTitle
  }
  if (wizardGame instanceof HTMLInputElement && document.activeElement !== wizardGame) {
    wizardGame.value = settings.streamGame || DEFAULT_STREAM_GAME
  }
  const profileId = settings.bitrateProfile || DEFAULT_BITRATE_PROFILE
  for (const select of [profile, quality, wizardQuality]) {
    if (select instanceof HTMLSelectElement && document.activeElement !== select) {
      if ([...select.options].some((o) => o.value === profileId)) {
        select.value = profileId
      }
    }
  }
}

function settingsMarkup() {
  const profileOptions = ENCODE_PROFILES.map(
    (p) => `<option value="${p.id}">${p.label}</option>`,
  ).join('')
  const kbps = [96, 128, 160, 192, 256]
    .map((v) => `<option value="${v}"${v === 160 ? ' selected' : ''}>${v}</option>`)
    .join('')

  return `
        <div class="settings-view-inner">
          <header class="settings-view-header">
            <h1 class="settings-view-title">Settings</h1>
            <p class="settings-view-lead">Preferences for streaming, recording, and the Studio workspace.</p>
          </header>
          <div class="settings-layout">
            <nav class="settings-tabs" aria-label="Settings categories">
              <button type="button" class="settings-tab active" data-settings-tab="general">General</button>
              <button type="button" class="settings-tab" data-settings-tab="streaming">Streaming</button>
              <button type="button" class="settings-tab" data-settings-tab="audio">Audio</button>
              <button type="button" class="settings-tab" data-settings-tab="video">Video / System</button>
              <button type="button" class="settings-tab" data-settings-tab="recording">Recording</button>
              <button type="button" class="settings-tab" data-settings-tab="help">Help</button>
            </nav>
            <div class="settings-panels">
              <div class="settings-panel active" id="settings-panel-general" data-settings-panel="general">
                <h2>General</h2>
                <label class="check">
                  <input type="checkbox" id="set-auto-update" />
                  Check for updates when Maka starts
                </label>
                <p class="settings-version-block">
                  <span class="field-label">Versions</span>
                  <span id="settings-app-version">App —</span>
                  <span id="settings-relay-version">Relay —</span>
                </p>
                <p class="settings-web-note">
                  Browser note: desktop auto-update applies in the Maka exe.
                  Preferences still save locally in this browser.
                </p>
              </div>
              <div class="settings-panel" id="settings-panel-streaming" data-settings-panel="streaming" data-streaming-note="wizard-only" hidden>
                <h2>Streaming</h2>
                <p class="hint tight" data-streaming-note="wizard-only">
                  Title, game, encode profile, and platform are set in Go Live. Twitch and YouTube
                  under the preview keep saved keys.
                </p>
              </div>
              <div class="settings-panel" id="settings-panel-audio" data-settings-panel="audio" hidden>
                <h2>Audio</h2>
                <label class="field-label" for="set-mic-device">Preferred microphone</label>
                <select id="set-mic-device" class="select">
                  <option value="">System default</option>
                </select>
                <label class="field-label" for="set-mic-bitrate">Microphone bitrate (kbps)</label>
                <select id="set-mic-bitrate" class="select">${kbps}</select>
                <label class="field-label" for="set-desktop-bitrate">Desktop / game audio bitrate (kbps)</label>
                <select id="set-desktop-bitrate" class="select">${kbps}</select>
                <p class="hint tight">Saved for future relay encoding; mixer capture is still being wired.</p>
              </div>
              <div class="settings-panel" id="settings-panel-video" data-settings-panel="video" hidden>
                <h2>Video / System</h2>
                <label class="field-label" for="set-video-encoder">Video encoder</label>
                <select id="set-video-encoder" class="select">
                  <option value="system">System default</option>
                  <option value="hardware">Hardware (GPU) when available</option>
                  <option value="software">Software (CPU)</option>
                </select>
                <label class="field-label" for="set-gpu-pref">GPU preference</label>
                <select id="set-gpu-pref" class="select">
                  <option value="default">System default</option>
                  <option value="discrete">Prefer discrete GPU</option>
                  <option value="integrated">Prefer integrated GPU</option>
                </select>
                <p class="hint tight" id="set-gpu-hint">GPU names are detected on Windows in the desktop app. Browser stores the preference for relay config.</p>
              </div>
              <div class="settings-panel" id="settings-panel-recording" data-settings-panel="recording" hidden>
                <h2>Recording</h2>
                <label class="field-label" for="set-recording-folder">Default save folder</label>
                <div class="settings-folder-row">
                  <input
                    id="set-recording-folder"
                    class="key-input settings-folder-input"
                    type="text"
                    readonly
                    placeholder="Choose a folder…"
                  />
                  <button type="button" id="btn-pick-recording-folder">Choose…</button>
                </div>
                <p class="hint tight">
                  When set, stopping a recording saves automatically here (timestamped filename). Shift+click Stop Recording to pick another path.
                </p>
                <p class="settings-web-note">
                  In the browser, Choose… uses the File System Access API when available; otherwise a folder label is stored for display only.
                </p>
              </div>
              <div class="settings-panel" id="settings-panel-help" data-settings-panel="help" hidden>
                <h2>Help</h2>
                <button type="button" class="btn-block spaced-btn" id="btn-check-updates">Check for updates</button>
                <a class="btn-block spaced-btn" id="btn-download-maka" href="/download.html">Download Maka desktop</a>
                <p class="settings-web-note">
                  About Maka web studio — App v${APP_VERSION}. Setup / onboarding tours ship with the
                  desktop installer. Updates open the GitHub releases list. Stream title, game, and
                  encode profile are set in Go Live.
                </p>
              </div>
            </div>
          </div>
          <footer class="settings-view-footer">
            <span id="settings-footer-version">Maka —</span>
          </footer>
        </div>`
}

function ensureRoot() {
  let el =
    document.getElementById('studio-settings') ||
    document.getElementById('settings-view')

  if (!el) {
    el = document.createElement('section')
    el.id = 'studio-settings'
    el.className = 'settings-view'
    el.hidden = true
    el.setAttribute('aria-label', 'Settings')
    el.dataset.settingsTab = 'general'
    el.dataset.region = 'settings'

    // Prefer direct child of .app so grid-area: stage matches Electron layout.
    const app = document.getElementById('studio-app') || document.querySelector('.app')
    if (app) app.appendChild(el)
    else {
      const host = document.querySelector('.stream-app') || document.body
      host.appendChild(el)
    }
  }

  el.classList.add('settings-view')
  if (!el.id) el.id = 'studio-settings'
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Settings')

  const needsMarkup =
    !el.querySelector('.settings-view-inner') ||
    !el.querySelector('[data-streaming-note="wizard-only"]') ||
    Boolean(el.querySelector('#set-stream-title')) ||
    Boolean(el.querySelector('#set-stream-category')) ||
    Boolean(el.querySelector('#btn-replay-setup')) ||
    Boolean(el.querySelector('#btn-open-go-live-wizard')) ||
    Boolean(el.querySelector('#set-tray-live'))
  if (needsMarkup) {
    el.innerHTML = settingsMarkup()
    delete el.dataset.settingsWired
  }

  return el
}

function setActiveSettingsTab(tabId) {
  if (!root || !isSettingsTabId(tabId)) return
  root.dataset.settingsTab = tabId
  for (const btn of root.querySelectorAll('.settings-tab')) {
    const active = btn.dataset.settingsTab === tabId
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-current', active ? 'page' : 'false')
  }
  for (const panel of root.querySelectorAll('.settings-panel')) {
    const active = panel.dataset.settingsPanel === tabId
    panel.classList.toggle('active', active)
    panel.hidden = !active
  }
}

function refreshVersionLabels() {
  const appLine = `App v${APP_VERSION}`
  let relayLine = 'Relay —'
  const live = window.MakaLive
  const source = live && typeof live.getRelaySource === 'function' ? live.getRelaySource() : null
  if (source && source.detected && source.host) {
    const version = source.version ? ` v${source.version}` : ''
    relayLine = `Relay${version} · ${source.host}`
  }

  const appVersionTop = document.getElementById('app-version-label')
  if (appVersionTop) appVersionTop.textContent = APP_VERSION
  const settingsApp = document.getElementById('settings-app-version')
  const settingsRelay = document.getElementById('settings-relay-version')
  const footer = document.getElementById('settings-footer-version')
  if (settingsApp) settingsApp.textContent = appLine
  if (settingsRelay) settingsRelay.textContent = relayLine
  if (footer) footer.textContent = `Maka ${appLine} · ${relayLine}`
}

function populateEncodeSelect(select) {
  if (!(select instanceof HTMLSelectElement)) return
  const current = select.value
  const needed = ENCODE_PROFILES.map((p) => p.id)
  const existing = [...select.options].map((o) => o.value)
  const incomplete =
    needed.some((id) => !existing.includes(id)) ||
    existing.some((id) => id && !needed.includes(id))
  if (incomplete || select.options.length === 0) {
    select.innerHTML = ''
    for (const p of ENCODE_PROFILES) {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.label
      select.appendChild(opt)
    }
  } else {
    for (const p of ENCODE_PROFILES) {
      const opt = [...select.options].find((o) => o.value === p.id)
      if (opt && opt.textContent !== p.label) opt.textContent = p.label
    }
  }
  if (current && needed.includes(current)) select.value = current
}

function readDestinations() {
  const out = { destTwitch: false, destYoutube: false, twitchKey: '', youtubeKey: '' }
  try {
    const raw = localStorage.getItem(DEST_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        out.destTwitch = Boolean(parsed.destTwitch)
        out.destYoutube = Boolean(parsed.destYoutube)
        if (typeof parsed.twitchKey === 'string') out.twitchKey = parsed.twitchKey.slice(0, 256)
        if (typeof parsed.youtubeKey === 'string') out.youtubeKey = parsed.youtubeKey.slice(0, 256)
      }
    }
  } catch {
    /* private mode */
  }
  return out
}

function saveDestinations(partial) {
  const next = { ...readDestinations(), ...(partial || {}) }
  try {
    localStorage.setItem(DEST_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  const twitch = document.getElementById('web-twitch-key')
  const youtube = document.getElementById('web-youtube-key')
  const setTwitch = document.getElementById('set-twitch-key')
  const setYoutube = document.getElementById('set-youtube-key')
  if (twitch instanceof HTMLInputElement && document.activeElement !== twitch) {
    twitch.value = next.twitchKey
  }
  if (youtube instanceof HTMLInputElement && document.activeElement !== youtube) {
    youtube.value = next.youtubeKey
  }
  if (setTwitch instanceof HTMLInputElement && document.activeElement !== setTwitch) {
    setTwitch.value = next.twitchKey
  }
  if (setYoutube instanceof HTMLInputElement && document.activeElement !== setYoutube) {
    setYoutube.value = next.youtubeKey
  }
  window.dispatchEvent(new CustomEvent('maka:destinations-change', { detail: { ...next } }))
  return next
}

async function populateMicDevices(select) {
  if (!(select instanceof HTMLSelectElement)) return
  const current = select.value
  select.innerHTML = '<option value="">System default</option>'
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return
    const devices = await Promise.race([
      navigator.mediaDevices.enumerateDevices(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('enumerateDevices timeout')), 1500)),
    ])
    for (const device of devices) {
      if (device.kind !== 'audioinput') continue
      const opt = document.createElement('option')
      opt.value = device.deviceId
      opt.textContent = device.label || `Microphone ${select.options.length}`
      select.appendChild(opt)
    }
  } catch {
    /* permissions missing, unsupported, or timed out */
  }
  if (current) select.value = current
}

function applySettingsToForm() {
  if (!root) return
  const byId = (id) => document.getElementById(id)

  const auto = byId('set-auto-update')
  if (auto instanceof HTMLInputElement) auto.checked = settings.autoCheckUpdatesOnStartup

  const encodeSelect = byId('set-encode-profile')
  if (encodeSelect instanceof HTMLSelectElement) {
    populateEncodeSelect(encodeSelect)
    encodeSelect.value = settings.bitrateProfile
  }
  populateEncodeSelect(byId('program-quality-select'))
  populateEncodeSelect(byId('cfg-profile'))
  const platform = byId('set-last-platform')
  if (platform instanceof HTMLSelectElement) platform.value = settings.lastStreamPlatform
  const title = byId('set-stream-title')
  if (title instanceof HTMLInputElement) title.value = settings.streamTitle
  const game = byId('set-stream-game')
  if (game instanceof HTMLInputElement) game.value = settings.streamGame || DEFAULT_STREAM_GAME
  const dest = readDestinations()
  const setTwitch = byId('set-twitch-key')
  const setYoutube = byId('set-youtube-key')
  if (setTwitch instanceof HTMLInputElement) setTwitch.value = dest.twitchKey
  if (setYoutube instanceof HTMLInputElement) setYoutube.value = dest.youtubeKey

  const micBitrate = byId('set-mic-bitrate')
  if (micBitrate instanceof HTMLSelectElement) micBitrate.value = String(settings.audioMicBitrateKbps)
  const deskBitrate = byId('set-desktop-bitrate')
  if (deskBitrate instanceof HTMLSelectElement) {
    deskBitrate.value = String(settings.audioDesktopBitrateKbps)
  }
  const encoder = byId('set-video-encoder')
  if (encoder instanceof HTMLSelectElement) encoder.value = settings.videoEncoderPreference
  const gpu = byId('set-gpu-pref')
  if (gpu instanceof HTMLSelectElement) {
    if (![...gpu.options].some((o) => o.value === settings.gpuPreference)) {
      const opt = document.createElement('option')
      opt.value = settings.gpuPreference
      opt.textContent = settings.gpuPreference
      gpu.appendChild(opt)
    }
    gpu.value = settings.gpuPreference
  }
  const folder = byId('set-recording-folder')
  if (folder instanceof HTMLInputElement) {
    folder.value = settings.recordingSaveFolder || ''
    folder.placeholder = settings.recordingSaveFolder ? '' : 'Choose a folder…'
  }
  if (isSettingsTabId(settings.settingsActiveTab)) {
    setActiveSettingsTab(settings.settingsActiveTab)
  }
  refreshVersionLabels()
}

async function openSettings() {
  root = ensureRoot()
  settings = loadSettings()
  const mode = document.body.dataset.mode || 'studio'
  if (mode !== 'settings') {
    priorMode = 'studio'
  }

  // Paint Settings chrome first — do not await device enumeration before mode switch
  // (enumerateDevices can hang ~1.5s in headless / locked-down browsers).
  applySettingsToForm()
  refreshVersionLabels()

  document.body.dataset.mode = 'settings'
  document.body.classList.add('stream-studio')
  root.hidden = false
  openState = true

  const btn = document.getElementById('btn-settings')
  if (btn) btn.setAttribute('aria-pressed', 'true')

  const tab = root.dataset.settingsTab || settings.settingsActiveTab || 'general'
  setActiveSettingsTab(isSettingsTabId(tab) ? tab : 'general')
  syncLiveDomFields()

  const micSelect = document.getElementById('set-mic-device')
  if (micSelect instanceof HTMLSelectElement) {
    try {
      await populateMicDevices(micSelect)
      if (settings.preferredMicDeviceId) micSelect.value = settings.preferredMicDeviceId
    } catch {
      /* ignore — Settings UI already visible */
    }
  }
}

function closeSettings() {
  if (!root) root = ensureRoot()
  openState = false
  root.hidden = true
  priorMode = 'studio'
  document.body.dataset.mode = 'studio'
  const btn = document.getElementById('btn-settings')
  if (btn) btn.setAttribute('aria-pressed', 'false')
  window.dispatchEvent(new CustomEvent('maka:close-settings-done', { detail: { mode: 'studio' } }))
}

function toggleSettings() {
  if (openState || document.body.dataset.mode === 'settings') closeSettings()
  else void openSettings()
}

async function pickRecordingFolder() {
  const folderInput = document.getElementById('set-recording-folder')
  if ('showDirectoryPicker' in window) {
    try {
      // @ts-expect-error File System Access API
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      const label = handle && handle.name ? handle.name : 'Selected folder'
      saveSettings({ recordingSaveFolder: label })
      if (folderInput instanceof HTMLInputElement) folderInput.value = label
      return
    } catch (err) {
      if (err && err.name === 'AbortError') return
    }
  }
  const fallback = window.prompt('Folder label for recordings (browser cannot write arbitrary paths):', settings.recordingSaveFolder || '')
  if (fallback == null) return
  const value = String(fallback).trim()
  saveSettings({ recordingSaveFolder: value })
  if (folderInput instanceof HTMLInputElement) {
    folderInput.value = value
    folderInput.placeholder = value ? '' : 'Choose a folder…'
  }
}

function wireForm() {
  if (!root || root.dataset.settingsWired === '1') return
  root.dataset.settingsWired = '1'

  for (const btn of root.querySelectorAll('.settings-tab')) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.settingsTab
      if (!tab || !isSettingsTabId(tab)) return
      setActiveSettingsTab(tab)
      saveSettings({ settingsActiveTab: tab })
    })
  }

  const persistCheckbox = (id, key) => {
    const el = document.getElementById(id)
    if (!(el instanceof HTMLInputElement)) return
    el.addEventListener('change', () => {
      saveSettings({ [key]: el.checked })
    })
  }
  persistCheckbox('set-auto-update', 'autoCheckUpdatesOnStartup')

  const encode = document.getElementById('set-encode-profile')
  if (encode) {
    encode.addEventListener('change', (event) => {
      const value = event.target.value || DEFAULT_BITRATE_PROFILE
      saveSettings({ bitrateProfile: value })
    })
  }

  const persistKeyField = (id, key) => {
    const el = document.getElementById(id)
    if (!(el instanceof HTMLInputElement)) return
    const commit = () => {
      saveDestinations({ [key]: String(el.value || '').trim().slice(0, 256) })
    }
    el.addEventListener('change', commit)
    el.addEventListener('blur', commit)
  }
  persistKeyField('set-twitch-key', 'twitchKey')
  persistKeyField('set-youtube-key', 'youtubeKey')

  const platform = document.getElementById('set-last-platform')
  if (platform) {
    platform.addEventListener('change', (event) => {
      const value = event.target.value
      saveSettings({ lastStreamPlatform: value })
      // Exclusive sync for Twitch/YouTube chips (settings dropdown is single-select).
      window.dispatchEvent(
        new CustomEvent('maka:settings-platform-sync', {
          detail: { lastStreamPlatform: value },
        }),
      )
    })
  }

  // Chips → settings form: keep #set-last-platform aligned with primary preference.
  window.addEventListener('maka:platform-pref-change', (event) => {
    const last = event?.detail?.lastStreamPlatform
    if (last !== 'twitch' && last !== 'youtube' && last !== 'none') return
    const select = document.getElementById('set-last-platform')
    if (select instanceof HTMLSelectElement && document.activeElement !== select) {
      select.value = last
    }
    // Persist without re-emitting exclusive chip sync (chips already updated).
    if (settings.lastStreamPlatform !== last) {
      settings = coerceSettings({ ...settings, lastStreamPlatform: last })
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      } catch {
        /* ignore */
      }
    }
  })

  const persistStreamMeta = (key, raw) => {
    const value = key === 'streamTitle' ? sanitizeTitle(raw) : sanitizeGame(raw)
    saveSettings({ [key]: value })
  }
  const title = document.getElementById('set-stream-title')
  if (title) {
    title.addEventListener('change', (e) => persistStreamMeta('streamTitle', e.target.value))
    title.addEventListener('blur', (e) => persistStreamMeta('streamTitle', e.target.value))
  }
  const game = document.getElementById('set-stream-game')
  if (game) {
    game.addEventListener('change', (e) => persistStreamMeta('streamGame', e.target.value))
    game.addEventListener('blur', (e) => persistStreamMeta('streamGame', e.target.value))
  }

  const micSelect = document.getElementById('set-mic-device')
  if (micSelect) {
    micSelect.addEventListener('change', () => {
      saveSettings({ preferredMicDeviceId: micSelect.value })
      window.dispatchEvent(
        new CustomEvent('maka:preferred-mic-change', { detail: { deviceId: micSelect.value } }),
      )
    })
  }

  for (const id of ['set-mic-bitrate', 'set-desktop-bitrate']) {
    const el = document.getElementById(id)
    if (!el) continue
    el.addEventListener('change', (event) => {
      const kbps = Number(event.target.value)
      if (id === 'set-mic-bitrate') saveSettings({ audioMicBitrateKbps: kbps })
      else saveSettings({ audioDesktopBitrateKbps: kbps })
    })
  }

  const encoder = document.getElementById('set-video-encoder')
  if (encoder) {
    encoder.addEventListener('change', (event) => {
      saveSettings({ videoEncoderPreference: event.target.value })
    })
  }
  const gpu = document.getElementById('set-gpu-pref')
  if (gpu) {
    gpu.addEventListener('change', (event) => {
      saveSettings({ gpuPreference: event.target.value })
    })
  }

  const pickBtn = document.getElementById('btn-pick-recording-folder')
  if (pickBtn) pickBtn.addEventListener('click', () => void pickRecordingFolder())

  const openWizard = document.getElementById('btn-open-go-live-wizard')
  if (openWizard) {
    openWizard.addEventListener('click', () => {
      closeSettings()
      window.dispatchEvent(new CustomEvent('maka:open-go-live-wizard'))
    })
  }
  const checkUpdates = document.getElementById('btn-check-updates')
  if (checkUpdates) {
    checkUpdates.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('maka:check-updates'))
      window.open('https://github.com/n0social/maka-streaming-software/releases', '_blank', 'noopener')
    })
  }
}

function wireShellChrome() {
  document.addEventListener('click', (event) => {
    const t = event.target
    if (!(t instanceof Element)) return
    const btn = t.closest('#btn-settings')
    if (btn) {
      event.preventDefault()
      toggleSettings()
      return
    }
    // Wordmark / brand click exits Settings and restores Studio (Stream tab removed).
    const brand = t.closest('.brand, .wordmark')
    if (brand && (openState || document.body.dataset.mode === 'settings')) {
      priorMode = 'studio'
      closeSettings()
    }
  })

  document.addEventListener('maka:open-settings', () => void openSettings())
  document.addEventListener('maka:close-settings', () => closeSettings())
  document.addEventListener('maka:toggle-settings', () => toggleSettings())
  window.addEventListener('maka:relay-source', () => refreshVersionLabels())
  window.addEventListener('maka:open-settings', () => void openSettings())
  window.addEventListener('maka:close-settings', () => closeSettings())
  window.addEventListener('maka:toggle-settings', () => toggleSettings())

  // Stream Info / stats bar / wizard → settings shared keys (one source of truth)
  const bindLiveField = (domId, key, sanitize) => {
    const el = document.getElementById(domId)
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement)) return
    const commit = () => {
      const value = sanitize(el.value)
      if (key === 'streamTitle' || key === 'streamGame' || key === 'bitrateProfile') {
        saveSettings({ [key]: value })
        const settingsField =
          key === 'streamTitle'
            ? document.getElementById('set-stream-title')
            : key === 'streamGame'
              ? document.getElementById('set-stream-game')
              : document.getElementById('set-encode-profile')
        if (
          settingsField instanceof HTMLInputElement ||
          settingsField instanceof HTMLSelectElement
        ) {
          if (document.activeElement !== settingsField) settingsField.value = value
        }
      }
    }
    el.addEventListener('change', commit)
    el.addEventListener('blur', commit)
  }
  bindLiveField('stream-title-input', 'streamTitle', sanitizeTitle)
  bindLiveField('stream-game-input', 'streamGame', sanitizeGame)
  bindLiveField('go-live-wizard-title-input', 'streamTitle', sanitizeTitle)
  bindLiveField('go-live-wizard-game-input', 'streamGame', sanitizeGame)
  bindLiveField('cfg-profile', 'bitrateProfile', (v) => String(v || DEFAULT_BITRATE_PROFILE))
  bindLiveField('program-quality-select', 'bitrateProfile', (v) => String(v || DEFAULT_BITRATE_PROFILE))
  bindLiveField('go-live-wizard-quality', 'bitrateProfile', (v) => String(v || DEFAULT_BITRATE_PROFILE))

  window.addEventListener('storage', (event) => {
    if (!event.key) return
    if (
      event.key !== STORAGE_KEY &&
      event.key !== SHARED.streamTitle &&
      event.key !== SHARED.streamGame &&
      event.key !== SHARED.streamCategoryLegacy &&
      event.key !== SHARED.bitrateProfile
    ) {
      return
    }
    settings = loadSettings()
    if (openState) applySettingsToForm()
    else syncLiveDomFields()
  })
}

function registerWithShell() {
  const api = {
    open: () => openSettings(),
    close: () => closeSettings(),
    toggle: () => toggleSettings(),
    isOpen: () => openState || document.body.dataset.mode === 'settings',
    getSettings: () => ({ ...settings }),
    setSettings: (partial) => saveSettings(partial || {}),
    refreshVersions: () => refreshVersionLabels(),
    storageKey: STORAGE_KEY,
    sharedKeys: { ...SHARED },
    appVersion: APP_VERSION,
  }

  window.MakaStudio = window.MakaStudio || {}
  if (typeof window.MakaStudio.registerView === 'function') {
    window.MakaStudio.registerView('settings', api)
  } else {
    window.MakaStudio.views = window.MakaStudio.views || {}
    window.MakaStudio.views.settings = api
    window.MakaStudio.registerView = function registerView(name, viewApi) {
      window.MakaStudio.views[name] = viewApi
      return viewApi
    }
    window.MakaStudio.registerView('settings', api)
  }
  window.MakaStudioSettings = api
  api.getDestinations = () => readDestinations()
  api.setDestinations = (partial) => saveDestinations(partial || {})
  api.encodeProfiles = ENCODE_PROFILES.slice()
  return api
}

function ensureStylesheet() {
  const hrefs = ['./css/settings.css', '/stream/css/settings.css']
  for (const href of hrefs) {
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => (l.getAttribute('href') || '').includes('settings.css'))) {
      return
    }
  }
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = '/stream/css/settings.css'
  document.head.appendChild(link)
}

function init() {
  ensureStylesheet()
  ensureSharedDefaults()
  settings = loadSettings()
  // Persist coerced defaults so Settings / stats bar / wizard never disagree on first paint.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
  persistShared({
    streamTitle: settings.streamTitle,
    streamGame: settings.streamGame,
    bitrateProfile: settings.bitrateProfile,
  })
  root = ensureRoot()
  wireForm()
  wireShellChrome()
  const api = registerWithShell()
  syncLiveDomFields()
  refreshVersionLabels()

  // Web client is Studio-only.
  document.documentElement.dataset.makaStartupMode = 'studio'
  return api
}

const api = init()
export default api
export {
  APP_VERSION,
  STORAGE_KEY,
  SHARED,
  ENCODE_PROFILES,
  DEFAULT_BITRATE_PROFILE,
  DEFAULT_STREAM_GAME,
  DEST_STORAGE_KEY,
  openSettings,
  closeSettings,
  toggleSettings,
  loadSettings,
  saveSettings,
  readDestinations,
  saveDestinations,
  populateEncodeSelect,
  sanitizeGame,
  sanitizeTitle,
}
