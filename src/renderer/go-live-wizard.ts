import type { EncodeProfileId } from '../shared/stream-encode-profiles'

export type GoLiveWizardPlatform = 'twitch' | 'youtube' | 'custom'

export type GoLiveWizardStep = 'platform' | 'key' | 'validate' | 'go'

export type GoLiveWizardBindings = {
  hasCustomRtmp: () => boolean
  isLive: () => boolean
  readUi: () => {
    destTwitch: boolean
    destYoutube: boolean
    destCustom: boolean
    twitchKey: string
    youtubeKey: string
    customUrl: string
    customKey: string
  }
  applyPlatform: (platform: GoLiveWizardPlatform) => void
  applyKeys: (partial: {
    twitchKey?: string
    youtubeKey?: string
    customUrl?: string
    customKey?: string
  }) => void
  validate: () => Promise<{ ok: boolean; message: string }>
  goLive: () => Promise<void>
  endLive: () => Promise<void>
  readEncodeProfile: () => EncodeProfileId
  applyEncodeProfile: (id: EncodeProfileId) => void
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
    private statusEl: HTMLElement,
    private panelPlatform: HTMLElement,
    private panelKey: HTMLElement,
    private panelValidate: HTMLElement,
    private panelGo: HTMLElement,
    private platformRadios: NodeListOf<HTMLInputElement>,
    private wizardTwitchKey: HTMLInputElement,
    private wizardYoutubeKey: HTMLInputElement,
    private wizardCustomUrl: HTMLInputElement,
    private wizardCustomKey: HTMLInputElement,
    private customKeyBlock: HTMLElement,
    private wizardQualitySelect: HTMLSelectElement,
    private goStatusEl: HTMLElement,
    private btnBack: HTMLButtonElement,
    private btnNext: HTMLButtonElement,
    private btnCancel: HTMLButtonElement,
    private bindings: GoLiveWizardBindings,
  ) {
    this.platformRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) this.platform = radio.value as GoLiveWizardPlatform
        this.syncKeyPanelVisibility()
      })
    })
    this.btnBack.addEventListener('click', () => this.back())
    this.btnNext.addEventListener('click', () => void this.forward())
    this.btnCancel.addEventListener('click', () => this.close())
    this.dialog.addEventListener('close', () => {
      this.validating = false
    })
    this.wizardQualitySelect.addEventListener('change', () => {
      this.bindings.applyEncodeProfile(this.wizardQualitySelect.value as EncodeProfileId)
      this.syncGoStepQualityStatus()
    })
  }

  private syncGoStepQualityStatus(): void {
    const option = this.wizardQualitySelect.selectedOptions[0]
    const label = option?.textContent?.trim() ?? this.wizardQualitySelect.value
    this.goStatusEl.textContent = this.lastValidateMessage
      ? `${this.lastValidateMessage} · ${label}`
      : `Ready at ${label}.`
  }

  open(): void {
    if (this.bindings.isLive()) {
      void this.bindings.endLive().finally(() => this.close())
      return
    }
    const ui = this.bindings.readUi()
    if (ui.destYoutube && ui.youtubeKey.trim()) this.platform = 'youtube'
    else if (ui.destCustom && this.bindings.hasCustomRtmp()) this.platform = 'custom'
    else this.platform = 'twitch'

    this.platformRadios.forEach((r) => {
      r.checked = r.value === this.platform
    })
    this.wizardTwitchKey.value = ui.twitchKey
    this.wizardYoutubeKey.value = ui.youtubeKey
    this.wizardCustomUrl.value = ui.customUrl
    this.wizardCustomKey.value = ui.customKey
    this.customKeyBlock.hidden = !this.bindings.hasCustomRtmp()
    const profile = this.bindings.readEncodeProfile()
    if (this.wizardQualitySelect.value !== profile) {
      this.wizardQualitySelect.value = profile
    }
    this.step = 'platform'
    this.lastValidateMessage = ''
    this.render()
    this.dialog.showModal()
  }

  close(): void {
    if (this.dialog.open) this.dialog.close()
  }

  private syncKeyPanelVisibility(): void {
    const twitchBlock = this.panelKey.querySelector('[data-wizard-key="twitch"]') as HTMLElement
    const youtubeBlock = this.panelKey.querySelector('[data-wizard-key="youtube"]') as HTMLElement
    if (twitchBlock) twitchBlock.hidden = this.platform !== 'twitch'
    if (youtubeBlock) youtubeBlock.hidden = this.platform !== 'youtube'
    this.customKeyBlock.hidden = this.platform !== 'custom' || !this.bindings.hasCustomRtmp()
  }

  private render(): void {
    this.panelPlatform.hidden = this.step !== 'platform'
    this.panelKey.hidden = this.step !== 'key'
    this.panelValidate.hidden = this.step !== 'validate'
    this.panelGo.hidden = this.step !== 'go'

    const steps: GoLiveWizardStep[] = ['platform', 'key', 'validate', 'go']
    const idx = steps.indexOf(this.step)
    this.stepLabel.textContent = `Step ${idx + 1} of ${steps.length}`

    if (this.step === 'platform') {
      this.titleEl.textContent = 'Choose platform'
      this.bodyEl.textContent =
        'Pick where you are streaming. You can change destinations later from the Twitch and YouTube chips in the stats bar.'
      this.btnBack.hidden = true
      this.btnNext.textContent = 'Next'
      this.btnNext.disabled = false
    } else if (this.step === 'key') {
      this.titleEl.textContent = 'Stream key'
      this.bodyEl.textContent =
        'Paste or confirm your stream key. Saved keys from the stats bar chips are loaded automatically.'
      this.syncKeyPanelVisibility()
      this.btnBack.hidden = false
      this.btnNext.textContent = 'Next'
      this.btnNext.disabled = false
    } else if (this.step === 'validate') {
      this.titleEl.textContent = 'Validate'
      this.bodyEl.textContent = 'We will post your keys to the local relay and verify ingest endpoints.'
      this.statusEl.textContent = this.validating
        ? 'Validating…'
        : this.lastValidateMessage || 'Press Validate to continue.'
      this.btnBack.hidden = false
      this.btnNext.textContent = this.validating ? 'Validating…' : 'Validate'
      this.btnNext.disabled = this.validating
    } else {
      this.titleEl.textContent = 'Go live'
      this.bodyEl.textContent =
        'Start publishing WHIP to the local relay. End Live from the same button when you are finished.'
      this.statusEl.textContent = this.lastValidateMessage
      this.syncGoStepQualityStatus()
      this.btnBack.hidden = false
      this.btnNext.textContent = 'Go Live'
      this.btnNext.disabled = false
    }
  }

  private back(): void {
    if (this.step === 'key') this.step = 'platform'
    else if (this.step === 'validate') this.step = 'key'
    else if (this.step === 'go') this.step = 'validate'
    this.render()
  }

  private async forward(): Promise<void> {
    if (this.step === 'platform') {
      const selected = [...this.platformRadios].find((r) => r.checked)
      this.platform = (selected?.value as GoLiveWizardPlatform) ?? 'twitch'
      this.bindings.applyPlatform(this.platform)
      this.step = 'key'
      this.render()
      return
    }

    if (this.step === 'key') {
      this.bindings.applyKeys({
        twitchKey: this.wizardTwitchKey.value,
        youtubeKey: this.wizardYoutubeKey.value,
        customUrl: this.wizardCustomUrl.value,
        customKey: this.wizardCustomKey.value,
      })
      this.step = 'validate'
      this.render()
      return
    }

    if (this.step === 'validate') {
      if (this.validating) return
      this.validating = true
      this.render()
      const result = await this.bindings.validate()
      this.validating = false
      this.lastValidateMessage = result.message
      if (!result.ok) {
        this.statusEl.dataset.state = 'error'
        this.render()
        return
      }
      this.statusEl.dataset.state = 'ok'
      this.step = 'go'
      this.render()
      return
    }

    if (this.step === 'go') {
      this.btnNext.disabled = true
      try {
        await this.bindings.goLive()
        this.close()
      } catch {
        this.btnNext.disabled = false
      }
    }
  }
}
