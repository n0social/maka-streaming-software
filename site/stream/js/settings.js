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
 * Shared keys (sync with live.js / Stream Info sidebar):
 *   maka.stream.streamTitle      ↔ settings.streamTitle / #stream-title-input / #set-stream-title
 *   maka.stream.streamCategory   ↔ settings.streamCategory / #stream-category-input / #set-stream-category
 *   maka.stream.bitrateProfile   ↔ settings.bitrateProfile / #cfg-profile / #set-encode-profile
 *
 * Mapping summary (settings.json → localStorage):
 *   minimizeToTrayWhileLive, openChatOnBrowse, labMode, autoCheckUpdatesOnStartup,
 *   bitrateProfile, lastStreamPlatform, streamTitle, streamCategory,
 *   preferredMicDeviceId, audioMicBitrateKbps, audioDesktopBitrateKbps,
 *   videoEncoderPreference, gpuPreference, recordingSaveFolder, startupMode,
 *   settingsActiveTab
 *   → stored in maka.stream.settings.v1 (same property names)
 *   + streamTitle / streamCategory / bitrateProfile mirrored to shared keys above
 *
 * Shell hooks:
 *   window.MakaStudio.registerView('settings', { open, close, isOpen, getSettings, setSettings })
 *   CustomEvent 'maka:open-settings' / 'maka:close-settings' / 'maka:toggle-settings'
 *   CustomEvent 'maka:settings-change' { detail: settings }
 *   Click #btn-settings toggles settings mode (body[data-mode='settings'])
 */
const APP_VERSION = '0.2.4' // mirrors package.json "version"

const STORAGE_KEY = 'maka.stream.settings.v1'
const SHARED = {
  streamTitle: 'maka.stream.streamTitle',
  streamCategory: 'maka.stream.streamCategory',
  bitrateProfile: 'maka.stream.bitrateProfile',
}

const SETTINGS_TAB_IDS = [
  'general',
  'streaming',
  'audio',
  'video',
  'recording',
  'modes',
  'help',
]

const ENCODE_PROFILES = [
  { id: '720p30', label: '720p @ 30fps' },
  { id: '720p60', label: '720p @ 60fps' },
  { id: '1080p30', label: '1080p @ 30fps' },
  { id: '1080p60', label: '1080p @ 60fps' },
  { id: '2k60', label: '2K @ 60fps' },
  { id: '4k60', label: '4K @ 60fps' },
]

const DEFAULT_SETTINGS = {
  bitrateProfile: '720p30',
  startupMode: 'studio',
  minimizeToTrayWhileLive: true,
  openChatOnBrowse: false,
  labMode: false,
  autoCheckUpdatesOnStartup: true,
  recordingSaveFolder: '',
  settingsActiveTab: 'general',
  lastStreamPlatform: 'none',
  streamTitle: '',
  streamCategory: '',
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
/** @type {'studio' | 'browse' | string} */
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

function sanitizeCategory(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100)
}

function coerceSettings(raw) {
  const out = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return out

  if (typeof raw.minimizeToTrayWhileLive === 'boolean') {
    out.minimizeToTrayWhileLive = raw.minimizeToTrayWhileLive
  }
  if (typeof raw.openChatOnBrowse === 'boolean') out.openChatOnBrowse = raw.openChatOnBrowse
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
  if (typeof raw.streamCategory === 'string') out.streamCategory = sanitizeCategory(raw.streamCategory)
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
  if (raw.startupMode === 'studio' || raw.startupMode === 'browse') out.startupMode = raw.startupMode
  if (isSettingsTabId(raw.settingsActiveTab)) out.settingsActiveTab = raw.settingsActiveTab
  return out
}

function readSharedOverrides(base) {
  const next = { ...base }
  try {
    const title = localStorage.getItem(SHARED.streamTitle)
    const category = localStorage.getItem(SHARED.streamCategory)
    const profile = localStorage.getItem(SHARED.bitrateProfile)
    if (title != null) next.streamTitle = sanitizeTitle(title)
    if (category != null) next.streamCategory = sanitizeCategory(category)
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
    if (Object.prototype.hasOwnProperty.call(partial, 'streamCategory')) {
      localStorage.setItem(SHARED.streamCategory, sanitizeCategory(partial.streamCategory))
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'bitrateProfile')) {
      localStorage.setItem(SHARED.bitrateProfile, String(partial.bitrateProfile))
    }
  } catch {
    /* ignore */
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
  const category = document.getElementById('stream-category-input')
  const profile = document.getElementById('cfg-profile')
  const quality = document.getElementById('program-quality-select')
  const outputMode = document.getElementById('program-output-mode')

  if (title instanceof HTMLInputElement && document.activeElement !== title) {
    title.value = settings.streamTitle
  }
  if (category instanceof HTMLInputElement && document.activeElement !== category) {
    category.value = settings.streamCategory
  }
  if (profile instanceof HTMLSelectElement && document.activeElement !== profile) {
    if ([...profile.options].some((o) => o.value === settings.bitrateProfile)) {
      profile.value = settings.bitrateProfile
    }
  }
  if (quality instanceof HTMLSelectElement && document.activeElement !== quality) {
    if ([...quality.options].some((o) => o.value === settings.bitrateProfile)) {
      quality.value = settings.bitrateProfile
    }
  }
  if (outputMode instanceof HTMLSelectElement && document.activeElement !== outputMode) {
    if (settings.startupMode === 'studio' || settings.startupMode === 'browse') {
      outputMode.value = settings.startupMode
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
            <p class="settings-view-lead">Preferences for streaming, recording, and workspace layout.</p>
          </header>
          <div class="settings-layout">
            <nav class="settings-tabs" aria-label="Settings categories">
              <button type="button" class="settings-tab active" data-settings-tab="general">General</button>
              <button type="button" class="settings-tab" data-settings-tab="streaming">Streaming</button>
              <button type="button" class="settings-tab" data-settings-tab="audio">Audio</button>
              <button type="button" class="settings-tab" data-settings-tab="video">Video / System</button>
              <button type="button" class="settings-tab" data-settings-tab="recording">Recording</button>
              <button type="button" class="settings-tab" data-settings-tab="modes">Studio &amp; Browser</button>
              <button type="button" class="settings-tab" data-settings-tab="help">Help</button>
            </nav>
            <div class="settings-panels">
              <div class="settings-panel active" id="settings-panel-general" data-settings-panel="general">
                <h2>General</h2>
                <label class="check">
                  <input type="checkbox" id="set-tray-live" />
                  Minimize to tray while live
                </label>
                <label class="check">
                  <input type="checkbox" id="set-open-chat" />
                  Open chat pop-out when entering Browser Mode
                </label>
                <label class="check">
                  <input type="checkbox" id="set-lab-mode" />
                  Demo mode (skip key validation)
                </label>
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
                  Browser note: tray minimize and desktop auto-update apply in the Maka exe.
                  Preferences still save locally in this browser (localStorage).
                </p>
              </div>
              <div class="settings-panel" id="settings-panel-streaming" data-settings-panel="streaming" hidden>
                <h2>Streaming</h2>
                <label class="field-label" for="set-encode-profile">Default encode quality</label>
                <select id="set-encode-profile" class="select">${profileOptions}</select>
                <p class="hint tight">Same preset as the program stats bar. Used for relay and local recording.</p>
                <label class="field-label" for="set-last-platform">Last go-live platform</label>
                <select id="set-last-platform" class="select">
                  <option value="none">Not set</option>
                  <option value="twitch">Twitch</option>
                  <option value="youtube">YouTube</option>
                </select>
                <label class="field-label" for="set-stream-title">Stream title</label>
                <input id="set-stream-title" class="key-input" type="text" maxlength="140" autocomplete="off" />
                <label class="field-label" for="set-stream-category">Category / game</label>
                <input id="set-stream-category" class="key-input" type="text" maxlength="100" autocomplete="off" />
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
              <div class="settings-panel" id="settings-panel-modes" data-settings-panel="modes" hidden>
                <h2>Studio &amp; Browser</h2>
                <p class="hint tight">Pick which workspace opens when you launch Maka. You can switch anytime from the program stats bar.</p>
                <div class="settings-mode-cards">
                  <article class="settings-mode-card" data-workspace-mode="studio">
                    <h3>Studio Mode</h3>
                    <p>Three-column layout with scenes, program preview, mixer, and go-live controls. Best for composing your stream.</p>
                    <button type="button" class="btn-block" data-set-startup="studio">Use Studio on startup</button>
                  </article>
                  <article class="settings-mode-card" data-workspace-mode="browse">
                    <h3>Browser Mode</h3>
                    <p>Full-window built-in browser for Twitch, YouTube Studio, and chat. Studio sidebars are hidden until you switch back.</p>
                    <button type="button" class="btn-block" data-set-startup="browse">Use Browser on startup</button>
                  </article>
                </div>
                <p class="hint tight" id="settings-startup-label">Startup: Studio Mode</p>
              </div>
              <div class="settings-panel" id="settings-panel-help" data-settings-panel="help" hidden>
                <h2>Help</h2>
                <button type="button" class="btn-block spaced-btn" id="btn-replay-setup">Replay setup wizard</button>
                <button type="button" class="btn-block spaced-btn" id="btn-check-updates">Check for updates</button>
                <button type="button" class="btn-block spaced-btn" id="btn-replay-tour">Replay onboarding tour</button>
                <p class="settings-web-note">
                  About Maka web studio — App v${APP_VERSION}. Updates ship with the desktop installer;
                  this page opens the GitHub releases list.
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

  if (!el.querySelector('.settings-view-inner')) {
    el.innerHTML = settingsMarkup()
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

function updateStartupLabel(mode) {
  const el = document.getElementById('settings-startup-label')
  if (!el) return
  el.textContent = mode === 'browse' ? 'Startup: Browser Mode' : 'Startup: Studio Mode'
}

function refreshVersionLabels() {
  const appLine = `App v${APP_VERSION}`
  let relayLine = 'Relay —'
  const relayText = document.getElementById('relay-status-text')
  const relayChip = document.getElementById('relay-label')
  const source = (relayText && relayText.textContent) || (relayChip && relayChip.textContent) || ''
  if (/online|ok|ready|v?\d/i.test(source) && !/checking|offline|required/i.test(source)) {
    const match = source.match(/v?\d+\.\d+(?:\.\d+)?/)
    relayLine = match ? `Relay v${match[0].replace(/^v/, '')}` : 'Relay detected'
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
  if (select.options.length > 0) return
  for (const p of ENCODE_PROFILES) {
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = p.label
    select.appendChild(opt)
  }
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

  const tray = byId('set-tray-live')
  const chat = byId('set-open-chat')
  const lab = byId('set-lab-mode')
  const auto = byId('set-auto-update')
  if (tray instanceof HTMLInputElement) tray.checked = settings.minimizeToTrayWhileLive
  if (chat instanceof HTMLInputElement) chat.checked = settings.openChatOnBrowse
  if (lab instanceof HTMLInputElement) lab.checked = settings.labMode
  if (auto instanceof HTMLInputElement) auto.checked = settings.autoCheckUpdatesOnStartup

  const encodeSelect = byId('set-encode-profile')
  if (encodeSelect instanceof HTMLSelectElement) {
    populateEncodeSelect(encodeSelect)
    encodeSelect.value = settings.bitrateProfile
  }
  const platform = byId('set-last-platform')
  if (platform instanceof HTMLSelectElement) platform.value = settings.lastStreamPlatform
  const title = byId('set-stream-title')
  if (title instanceof HTMLInputElement) title.value = settings.streamTitle
  const category = byId('set-stream-category')
  if (category instanceof HTMLInputElement) category.value = settings.streamCategory

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
  updateStartupLabel(settings.startupMode)
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
    const app = document.getElementById('studio-app')
    const fromApp = app && (app.dataset.outputMode === 'browse' || app.dataset.outputMode === 'studio')
      ? app.dataset.outputMode
      : null
    priorMode = fromApp || (mode === 'browse' ? 'browse' : 'studio')
  }

  applySettingsToForm()
  const micSelect = document.getElementById('set-mic-device')
  if (micSelect instanceof HTMLSelectElement) {
    await populateMicDevices(micSelect)
    micSelect.value = settings.preferredMicDeviceId || ''
  }
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
}

function closeSettings() {
  if (!root) root = ensureRoot()
  openState = false
  root.hidden = true
  const restore = priorMode === 'browse' ? 'browse' : 'studio'
  document.body.dataset.mode = restore
  const btn = document.getElementById('btn-settings')
  if (btn) btn.setAttribute('aria-pressed', 'false')
  window.dispatchEvent(new CustomEvent('maka:close-settings-done', { detail: { mode: restore } }))
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
  persistCheckbox('set-tray-live', 'minimizeToTrayWhileLive')
  persistCheckbox('set-open-chat', 'openChatOnBrowse')
  persistCheckbox('set-lab-mode', 'labMode')
  persistCheckbox('set-auto-update', 'autoCheckUpdatesOnStartup')

  const encode = document.getElementById('set-encode-profile')
  if (encode) {
    encode.addEventListener('change', (event) => {
      const value = event.target.value
      saveSettings({ bitrateProfile: value })
    })
  }

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
    const value = key === 'streamTitle' ? sanitizeTitle(raw) : sanitizeCategory(raw)
    saveSettings({ [key]: value })
  }
  const title = document.getElementById('set-stream-title')
  if (title) {
    title.addEventListener('change', (e) => persistStreamMeta('streamTitle', e.target.value))
    title.addEventListener('blur', (e) => persistStreamMeta('streamTitle', e.target.value))
  }
  const category = document.getElementById('set-stream-category')
  if (category) {
    category.addEventListener('change', (e) => persistStreamMeta('streamCategory', e.target.value))
    category.addEventListener('blur', (e) => persistStreamMeta('streamCategory', e.target.value))
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

  for (const btn of root.querySelectorAll('[data-set-startup]')) {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.setStartup
      if (mode !== 'studio' && mode !== 'browse') return
      saveSettings({ startupMode: mode })
      updateStartupLabel(mode)
      const outputMode = document.getElementById('program-output-mode')
      if (outputMode instanceof HTMLSelectElement) outputMode.value = mode
      window.dispatchEvent(new CustomEvent('maka:startup-mode-change', { detail: { mode } }))
    })
  }

  const replaySetup = document.getElementById('btn-replay-setup')
  if (replaySetup) {
    replaySetup.addEventListener('click', () => {
      closeSettings()
      window.dispatchEvent(new CustomEvent('maka:replay-setup'))
    })
  }
  const replayTour = document.getElementById('btn-replay-tour')
  if (replayTour) {
    replayTour.addEventListener('click', () => {
      closeSettings()
      window.dispatchEvent(new CustomEvent('maka:replay-tour'))
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
    // Electron: Stream tab exits Settings and restores Studio.
    const streamTab = t.closest('#tab-stream')
    if (streamTab && (openState || document.body.dataset.mode === 'settings')) {
      priorMode = 'studio'
      closeSettings()
    }
  })

  document.addEventListener('maka:open-settings', () => void openSettings())
  document.addEventListener('maka:close-settings', () => closeSettings())
  document.addEventListener('maka:toggle-settings', () => toggleSettings())
  window.addEventListener('maka:open-settings', () => void openSettings())
  window.addEventListener('maka:close-settings', () => closeSettings())
  window.addEventListener('maka:toggle-settings', () => toggleSettings())

  // Stream Info sidebar → settings shared keys
  const bindLiveField = (domId, key, sanitize) => {
    const el = document.getElementById(domId)
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement)) return
    const commit = () => {
      const value = sanitize(el.value)
      if (key === 'streamTitle' || key === 'streamCategory' || key === 'bitrateProfile') {
        saveSettings({ [key]: value })
        const settingsField =
          key === 'streamTitle'
            ? document.getElementById('set-stream-title')
            : key === 'streamCategory'
              ? document.getElementById('set-stream-category')
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
  bindLiveField('stream-category-input', 'streamCategory', sanitizeCategory)
  bindLiveField('cfg-profile', 'bitrateProfile', (v) => String(v || '720p30'))
  bindLiveField('program-quality-select', 'bitrateProfile', (v) => String(v || '720p30'))

  window.addEventListener('storage', (event) => {
    if (!event.key) return
    if (
      event.key !== STORAGE_KEY &&
      event.key !== SHARED.streamTitle &&
      event.key !== SHARED.streamCategory &&
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
  settings = loadSettings()
  root = ensureRoot()
  wireForm()
  wireShellChrome()
  const api = registerWithShell()
  syncLiveDomFields()
  refreshVersionLabels()

  // Apply startup mode hint for shell (does not force-hide studio on first paint).
  document.documentElement.dataset.makaStartupMode = settings.startupMode
  return api
}

const api = init()
export default api
export {
  APP_VERSION,
  STORAGE_KEY,
  SHARED,
  openSettings,
  closeSettings,
  toggleSettings,
  loadSettings,
  saveSettings,
}
