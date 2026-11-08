import type { EncodeProfileId } from '../shared/stream-encode-profiles'
import { validateTwitchStreamKey, validateYoutubeStreamKey, validateCustomRtmp } from '../shared/stream-keys'

export type GoLiveWizardPlatform = 'twitch' | 'youtube' | 'custom'

export type GoLiveWizardStep = 'platform' | 'key' | 'details' | 'validate' | 'go'

const STEPS: GoLiveWizardStep[] = ['platform', 'key', 'details', 'validate', 'go']

const TITLE_KEY = 'maka.stream.title'
const GAME_KEY = 'maka.stream.game'

export type GoLiveWizardBindings = {
  isLive: () => boolean
  labMode: () => boolean
  hasCustomRtmp: () => boolean
  readKeys: () => { twitchKey: string; youtubeKey: string; customUrl: string; customKey: string }
  applyDestination: (platform: GoLiveWizardPlatform, key: string, customUrl: string) => void
  readEncodeProfile: () => EncodeProfileId
  applyEncodeProfile: (id: EncodeProfileId) => void
  applyStreamInfo: (title: string, game: string) => void
  validateRelay: () => Promise<{ ok: boolean; message: string }>
  goLive: () => Promise<void>
  endLive: () => Promise<void>
}

export function readStoredStreamTitle(): string {
  try {
    return localStorage.getItem(TITLE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function readStoredStreamGame(): string {
  try {
    return localStorage.getItem(GAME_KEY)?.trim() || 'Just Chatting'
  } catch {
    return 'Just Chatting'
  }
}

export function storeStreamInfo(title: string, game: string): void {
  try {
    localStorage.setItem(TITLE_KEY, title)
    localStorage.setItem(GAME_KEY, game || 'Just Chatting')
  } catch {
    /* private mode */
  }
}

export class GoLiveWizard {
  private step: GoLiveWizardStep = 'platform'
  private platform: GoLiveWizardPlatform = 'twitch'
  private validating = false
  private lastValidateMessage = ''

  constructor(
    private dialog: HTMLDialogElement,
    private stepLabel: HTMLElement,
    private titleEl: HTMLElement,
    private bodyEl: HTMLElement,
    private panelPlatform: HTMLElement,
    private panelKey: HTMLElement,
    private panelDetails: HTMLElement,
    private panelValidate: HTMLElement,
    private panelGo: HTMLElement,
    private twitchKey: HTMLInputElement,
    private youtubeKey: HTMLInputElement,
    private customUrl: HTMLInputElement,
    private customKey: HTMLInputElement,
    private keyHint: HTMLElement,
    private titleInput: HTMLInputElement,
    private gameInput: HTMLInputElement,
    private qualitySelect: HTMLSelectElement,
    private statusEl: HTMLElement,
    private goStatusEl: HTMLElement,
    private customPlatformButton: HTMLButtonElement,
    private btnBack: HTMLButtonElement,
    private btnNext: HTMLButtonElement,
    private btnCancel: HTMLButtonElement,
    private bindings: GoLiveWizardBindings,
  ) {
    for (const id of ['wizard-platform-twitch', 'wizard-platform-youtube', 'wizard-platform-custom']) {
      dialog.querySelector<HTMLButtonElement>(`#${id}`)?.addEventListener('click', () => {
        const value = dialog.querySelector<HTMLButtonElement>(`#${id}`)?.dataset.platform
        if (value === 'twitch' || value === 'youtube' || value === 'custom') {
          this.platform = value
          this.paintPlatform()
          this.syncKeyFields()
          this.refreshKeyGate()
        }
      })
    }
    for (const input of [twitchKey, youtubeKey, customUrl, customKey]) {
      input.addEventListener('input', () => this.refreshKeyGate())
    }
    qualitySelect.addEventListener('change', () => {
      this.bindings.applyEncodeProfile(qualitySelect.value as EncodeProfileId)
    })
    btnBack.addEventListener('click', () => this.back())
    btnNext.addEventListener('click', () => void this.forward())
    btnCancel.addEventListener('click', () => this.close())
  }

  open(): void {
    if (this.bindings.isLive()) {
      void this.bindings.endLive().finally(() => this.close())
      return
    }
    const keys = this.bindings.readKeys()
    this.twitchKey.value = keys.twitchKey
    this.youtubeKey.value = keys.youtubeKey
    this.customUrl.value = keys.customUrl
    this.customKey.value = keys.customKey
    this.customPlatformButton.hidden = !this.bindings.hasCustomRtmp()
    this.titleInput.value = readStoredStreamTitle()
    this.gameInput.value = readStoredStreamGame()
    const profile = this.bindings.readEncodeProfile()
    if ([...this.qualitySelect.options].some((option) => option.value === profile)) {
      this.qualitySelect.value = profile
    }
    this.platform = 'twitch'
    this.step = 'platform'
    this.lastValidateMessage = ''
    this.validating = false
    this.render()
    this.dialog.showModal()
  }

  close(): void {
    if (this.dialog.open) this.dialog.close()
  }

  private paintPlatform(): void {
    for (const button of this.panelPlatform.querySelectorAll<HTMLButtonElement>('.platform-pick')) {
      button.setAttribute('aria-pressed', button.dataset.platform === this.platform ? 'true' : 'false')
    }
  }

  private syncKeyFields(): void {
    this.twitchKey.hidden = this.platform !== 'twitch'
    this.youtubeKey.hidden = this.platform !== 'youtube'
    const custom = this.platform === 'custom'
    this.customUrl.hidden = !custom
    this.customKey.hidden = !custom
  }

  private activeKeyOk(): { ok: boolean; message: string } {
    if (this.bindings.labMode()) {
      const value =
        this.platform === 'youtube'
          ? this.youtubeKey.value.trim()
          : this.platform === 'custom'
            ? this.customKey.value.trim()
            : this.twitchKey.value.trim()
      if (!value) return { ok: false, message: 'Enter a placeholder key to continue.' }
      if (this.platform === 'custom' && !this.customUrl.value.trim()) {
        return { ok: false, message: 'Custom RTMP needs an ingest URL.' }
      }
      return { ok: true, message: '' }
    }
    if (this.platform === 'twitch') {
      const result = validateTwitchStreamKey(this.twitchKey.value)
      return result.ok ? { ok: true, message: '' } : result
    }
    if (this.platform === 'youtube') {
      if (!this.youtubeKey.value.trim()) {
        return { ok: false, message: 'Enter your YouTube stream key (abcd-efgh-ijkl-mnop).' }
      }
      const result = validateYoutubeStreamKey(this.youtubeKey.value)
      return result.ok ? { ok: true, message: '' } : result
    }
    const result = validateCustomRtmp(this.customUrl.value, this.customKey.value)
    return result.ok ? { ok: true, message: '' } : result
  }

  private refreshKeyGate(): void {
    if (this.step !== 'key') return
    const result = this.activeKeyOk()
    this.btnNext.disabled = !result.ok
    if (!result.ok && this.currentKeyValue()) {
      this.keyHint.hidden = false
      this.keyHint.textContent = result.message
    } else {
      this.keyHint.hidden = true
      this.keyHint.textContent = ''
    }
  }

  private currentKeyValue(): string {
    if (this.platform === 'youtube') return this.youtubeKey.value.trim()
    if (this.platform === 'custom') return this.customKey.value.trim() || this.customUrl.value.trim()
    return this.twitchKey.value.trim()
  }

  private render(): void {
    this.panelPlatform.hidden = this.step !== 'platform'
    this.panelKey.hidden = this.step !== 'key'
    this.panelDetails.hidden = this.step !== 'details'
    this.panelValidate.hidden = this.step !== 'validate'
    this.panelGo.hidden = this.step !== 'go'
    this.paintPlatform()
    this.syncKeyFields()

    const index = STEPS.indexOf(this.step)
    this.stepLabel.textContent = `Step ${index + 1} of ${STEPS.length}`
    this.btnBack.hidden = this.step === 'platform'
    this.btnNext.disabled = this.validating
    this.btnNext.textContent = this.step === 'go' ? 'Go Live' : this.step === 'validate' ? 'Validate' : 'Next'
    if (this.validating) this.btnNext.textContent = 'Validating…'

    if (this.step === 'platform') {
      this.titleEl.textContent = 'Choose a platform'
      this.bodyEl.textContent = 'Which platform would you like to stream to?'
    } else if (this.step === 'key') {
      this.titleEl.textContent = 'Stream key'
      this.bodyEl.textContent = 'Enter your stream key'
      this.refreshKeyGate()
    } else if (this.step === 'details') {
      this.titleEl.textContent = 'Stream info'
      this.bodyEl.textContent = ''
    } else if (this.step === 'validate') {
      this.titleEl.textContent = 'Check relay'
      this.bodyEl.textContent = 'We will post your key to the local relay and verify the ingest endpoint.'
      this.statusEl.textContent = this.validating ? 'Validating…' : this.lastValidateMessage || 'Press Validate to continue.'
      this.statusEl.dataset.state = this.lastValidateMessage && !this.validating ? this.statusEl.dataset.state ?? '' : ''
    } else {
      this.titleEl.textContent = 'Go live'
      this.bodyEl.textContent = 'Start publishing to the local relay. End Live from the same button when you are finished.'
      this.goStatusEl.textContent = this.lastValidateMessage
    }
  }

  private back(): void {
    const index = STEPS.indexOf(this.step)
    const previous = STEPS[index - 1]
    if (!previous) return
    this.step = previous
    this.render()
  }

  private async forward(): Promise<void> {
    if (this.step === 'platform') {
      this.step = 'key'
      this.render()
      return
    }
    if (this.step === 'key') {
      const result = this.activeKeyOk()
      if (!result.ok) {
        this.refreshKeyGate()
        return
      }
      this.bindings.applyDestination(
        this.platform,
        this.platform === 'youtube' ? this.youtubeKey.value : this.platform === 'custom' ? this.customKey.value : this.twitchKey.value,
        this.customUrl.value,
      )
      this.step = 'details'
      this.render()
      return
    }
    if (this.step === 'details') {
      const title = this.titleInput.value.trim()
      const game = this.gameInput.value.trim() || 'Just Chatting'
      storeStreamInfo(title, game)
      this.bindings.applyStreamInfo(title, game)
      this.bindings.applyEncodeProfile(this.qualitySelect.value as EncodeProfileId)
      this.step = 'validate'
      this.render()
      return
    }
    if (this.step === 'validate') {
      if (this.validating) return
      this.validating = true
      this.render()
      const result = await this.bindings.validateRelay()
      this.validating = false
      this.lastValidateMessage = result.message
      this.statusEl.dataset.state = result.ok ? 'ok' : 'error'
      if (!result.ok) {
        this.render()
        this.statusEl.textContent = result.message
        this.statusEl.dataset.state = 'error'
        return
      }
      this.step = 'go'
      this.render()
      return
    }
    this.btnNext.disabled = true
    try {
      await this.bindings.goLive()
      if (this.bindings.isLive()) this.close()
    } finally {
      this.btnNext.disabled = false
    }
  }
}
