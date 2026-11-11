import type { AppSettings, TabcastBridge } from '../preload/index'

const SETTINGS_TAB_IDS = [
  'general',
  'streaming',
  'audio',
  'video',
  'recording',
  'help',
] as const

type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number]

function isSettingsTabId(value: string): value is SettingsTabId {
  return (SETTINGS_TAB_IDS as readonly string[]).includes(value)
}
import { ENCODE_PROFILE_ORDER, encodeProfileSpec } from '../shared/stream-encode-profiles'

export type SettingsViewHooks = {
  onLabModeChange: (labMode: boolean) => void
  onEncodeProfileChange: (profile: AppSettings['bitrateProfile']) => void
  onRecordingFolderChange: (folder: string) => void
  onRelayStudioSettingsChange: () => void
  onReplaySetup: () => void
  onReplayTour: () => void
  onCheckUpdates: () => void
}

function setActiveSettingsTab(root: HTMLElement, tabId: SettingsTabId): void {
  root.dataset.settingsTab = tabId
  for (const btn of root.querySelectorAll<HTMLButtonElement>('.settings-tab')) {
    const active = btn.dataset.settingsTab === tabId
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-current', active ? 'page' : 'false')
  }
  for (const panel of root.querySelectorAll<HTMLElement>('.settings-panel')) {
    const active = panel.dataset.settingsPanel === tabId
    panel.classList.toggle('active', active)
    panel.hidden = !active
  }
}

function populateEncodeSelect(select: HTMLSelectElement): void {
  if (select.options.length > 0) return
  for (const id of ENCODE_PROFILE_ORDER) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = encodeProfileSpec(id).menuLabel
    select.appendChild(opt)
  }
}

function applySettingsToForm(s: AppSettings): void {
  ;(document.getElementById('set-tray-live') as HTMLInputElement).checked =
    s.minimizeToTrayWhileLive
  ;(document.getElementById('set-lab-mode') as HTMLInputElement).checked = s.labMode
  ;(document.getElementById('set-auto-update') as HTMLInputElement).checked =
    s.autoCheckUpdatesOnStartup
  const encodeSelect = document.getElementById('set-encode-profile') as HTMLSelectElement
  populateEncodeSelect(encodeSelect)
  encodeSelect.value = s.bitrateProfile
  ;(document.getElementById('set-mic-bitrate') as HTMLSelectElement).value = String(
    s.audioMicBitrateKbps,
  )
  ;(document.getElementById('set-desktop-bitrate') as HTMLSelectElement).value = String(
    s.audioDesktopBitrateKbps,
  )
  ;(document.getElementById('set-video-encoder') as HTMLSelectElement).value =
    s.videoEncoderPreference
  ;(document.getElementById('set-gpu-pref') as HTMLSelectElement).value = s.gpuPreference
  const folderInput = document.getElementById('set-recording-folder') as HTMLInputElement
  folderInput.value = s.recordingSaveFolder || ''
  folderInput.placeholder = s.recordingSaveFolder ? '' : 'Choose a folder…'
  const tab = s.settingsActiveTab
  if (isSettingsTabId(tab)) {
    setActiveSettingsTab(document.getElementById('settings-view') as HTMLElement, tab)
  }
}

async function refreshVersionLabels(tabcast: TabcastBridge): Promise<void> {
  const info = await tabcast.getVersionInfo()
  const appLine = `App v${info.appVersion}`
  const relayLine = info.relayVersion ? `Relay v${info.relayVersion}` : 'Relay —'
  const appVersionTop = document.getElementById('app-version-label')
  if (appVersionTop) appVersionTop.textContent = info.appVersion
  const settingsApp = document.getElementById('settings-app-version')
  const settingsRelay = document.getElementById('settings-relay-version')
  const footer = document.getElementById('settings-footer-version')
  if (settingsApp) settingsApp.textContent = appLine
  if (settingsRelay) settingsRelay.textContent = relayLine
  if (footer) footer.textContent = `Maka ${appLine} · ${relayLine}`
}

async function populateGpuSelect(tabcast: TabcastBridge, selected: string): Promise<void> {
  const select = document.getElementById('set-gpu-pref') as HTMLSelectElement
  const options = await tabcast.listGpuOptions()
  select.innerHTML = ''
  for (const opt of options) {
    const el = document.createElement('option')
    el.value = opt.id
    el.textContent = opt.label
    select.appendChild(el)
  }
  if (options.some((o) => o.id === selected)) {
    select.value = selected
  } else {
    select.value = 'default'
  }
}

export function initSettingsView(tabcast: TabcastBridge, hooks: SettingsViewHooks): {
  open: () => Promise<void>
  refreshVersions: () => Promise<void>
} {
  const root = document.getElementById('settings-view') as HTMLElement

  for (const btn of root.querySelectorAll<HTMLButtonElement>('.settings-tab')) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.settingsTab
      if (!tab || !isSettingsTabId(tab)) return
      setActiveSettingsTab(root, tab)
      void tabcast.setSettings({ settingsActiveTab: tab })
    })
  }

  const persistCheckbox = (id: string, key: keyof AppSettings) => {
    const el = document.getElementById(id) as HTMLInputElement
    el.addEventListener('change', () => {
      void tabcast.setSettings({ [key]: el.checked } as Partial<AppSettings>).then((s) => {
        if (key === 'labMode') hooks.onLabModeChange(s.labMode)
      })
    })
  }

  persistCheckbox('set-tray-live', 'minimizeToTrayWhileLive')
  persistCheckbox('set-lab-mode', 'labMode')
  persistCheckbox('set-auto-update', 'autoCheckUpdatesOnStartup')

  document.getElementById('set-encode-profile')!.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value as AppSettings['bitrateProfile']
    void tabcast.setSettings({ bitrateProfile: value }).then(() => {
      hooks.onEncodeProfileChange(value)
    })
  })

  for (const id of ['set-mic-bitrate', 'set-desktop-bitrate'] as const) {
    document.getElementById(id)!.addEventListener('change', (event) => {
      const kbps = Number((event.target as HTMLSelectElement).value)
      const patch =
        id === 'set-mic-bitrate'
          ? { audioMicBitrateKbps: kbps }
          : { audioDesktopBitrateKbps: kbps }
      void tabcast.setSettings(patch).then(() => hooks.onRelayStudioSettingsChange())
    })
  }

  document.getElementById('set-video-encoder')!.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement)
      .value as AppSettings['videoEncoderPreference']
    void tabcast.setSettings({ videoEncoderPreference: value }).then(() => hooks.onRelayStudioSettingsChange())
  })

  document.getElementById('set-gpu-pref')!.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value as AppSettings['gpuPreference']
    void tabcast.setSettings({ gpuPreference: value }).then(() => hooks.onRelayStudioSettingsChange())
  })

  document.getElementById('btn-pick-recording-folder')!.addEventListener('click', () => {
    void tabcast.pickRecordingFolder().then((result) => {
      if (result.canceled) return
      void tabcast.setSettings({ recordingSaveFolder: result.path }).then((s) => {
        const folderInput = document.getElementById('set-recording-folder') as HTMLInputElement
        folderInput.value = s.recordingSaveFolder
        hooks.onRecordingFolderChange(s.recordingSaveFolder)
      })
    })
  })

  document.getElementById('btn-replay-setup')!.addEventListener('click', () => {
    hooks.onReplaySetup()
  })
  document.getElementById('btn-replay-tour')!.addEventListener('click', () => {
    hooks.onReplayTour()
  })
  document.getElementById('btn-check-updates')!.addEventListener('click', () => {
    hooks.onCheckUpdates()
  })

  return {
    open: async () => {
      const s = await tabcast.getSettings()
      applySettingsToForm(s)
      await populateGpuSelect(tabcast, s.gpuPreference)
      await refreshVersionLabels(tabcast)
      root.hidden = false
      const tabFromDom = root.dataset.settingsTab || 'general'
      setActiveSettingsTab(root, isSettingsTabId(tabFromDom) ? tabFromDom : 'general')
    },
    refreshVersions: () => refreshVersionLabels(tabcast),
  }
}
