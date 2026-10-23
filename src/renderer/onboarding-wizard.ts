export type WizardStepId = 'welcome' | 'relay' | 'capture' | 'keys' | 'ready'

export type WizardStep = {
  id: WizardStepId
  title: string
  body: string
}

export const SETUP_WIZARD_STEPS: WizardStep[] = [
  {
    id: 'welcome',
    title: 'Set up Maka',
    body: 'Checks relay, capture, and optional keys. About a minute — skip if you know the studio.',
  },
  {
    id: 'relay',
    title: 'Relay health',
    body: 'Local encoder on port 38473. We verify the relay binary and health before you go live.',
  },
  {
    id: 'capture',
    title: 'Capture test',
    body: 'Pick a display or window source for your program feed. At least one capture source must be available.',
  },
  {
    id: 'keys',
    title: 'Stream keys (optional)',
    body: 'Paste Twitch or YouTube stream keys now, or skip and add them later in Destinations. Keys stay in relay memory only.',
  },
  {
    id: 'ready',
    title: 'Ready to stream',
    body: 'Setup complete. Choose a source, verify destinations, then hit Go Live — or replay the UI tour from Settings.',
  },
]

type WizardOptions = {
  onComplete: () => void
  onSkip: () => void
}

export class SetupWizard {
  private index = 0
  private relayOk = false
  private captureOk = false
  private keysSkipped = true

  constructor(
    private root: HTMLElement,
    private stepLabel: HTMLElement,
    private titleEl: HTMLElement,
    private bodyEl: HTMLElement,
    private statusEl: HTMLElement,
    private keysPanel: HTMLElement,
    private twitchKeyInput: HTMLInputElement,
    private youtubeKeyInput: HTMLInputElement,
    private btnPrev: HTMLButtonElement,
    private btnNext: HTMLButtonElement,
    private btnSkip: HTMLButtonElement,
    private options: WizardOptions,
  ) {
    this.btnPrev.addEventListener('click', () => this.prev())
    this.btnNext.addEventListener('click', () => void this.next())
    this.btnSkip.addEventListener('click', () => this.finish(true))
  }

  start(): void {
    this.index = 0
    this.relayOk = false
    this.captureOk = false
    this.root.hidden = false
    this.root.classList.remove('hidden')
    document.body.classList.add('setup-wizard-active')
    void this.renderStep()
  }

  isOpen(): boolean {
    return !this.root.hidden
  }

  private finish(skipped: boolean): void {
    this.root.hidden = true
    this.root.classList.add('hidden')
    document.body.classList.remove('setup-wizard-active')
    if (skipped) this.options.onSkip()
    else this.options.onComplete()
  }

  private prev(): void {
    if (this.index <= 0) return
    this.index -= 1
    void this.renderStep()
  }

  private async next(): Promise<void> {
    const step = SETUP_WIZARD_STEPS[this.index]
    if (!step) return

    if (step.id === 'relay' && !this.relayOk) {
      await this.runRelayCheck(this.statusEl, this.bodyEl, this.btnNext)
      if (!this.relayOk) return
    }

    if (step.id === 'capture' && !this.captureOk) {
      await this.runCaptureCheck(this.statusEl, this.bodyEl, this.btnNext)
      if (!this.captureOk) return
    }

    if (step.id === 'keys') {
      this.keysSkipped =
        !this.twitchKeyInput.value.trim() && !this.youtubeKeyInput.value.trim()
    }

    if (this.index >= SETUP_WIZARD_STEPS.length - 1) {
      this.finish(false)
      return
    }

    this.index += 1
    await this.renderStep()
  }

  private async renderStep(): Promise<void> {
    const step = SETUP_WIZARD_STEPS[this.index]
    if (!step) return

    this.stepLabel.textContent = `Step ${this.index + 1} of ${SETUP_WIZARD_STEPS.length}`
    this.titleEl.textContent = step.title
    this.bodyEl.textContent = step.body
    this.statusEl.textContent = ''
    this.statusEl.dataset.state = ''
    this.btnPrev.disabled = this.index === 0
    this.keysPanel.hidden = step.id !== 'keys'

    if (step.id === 'relay') {
      this.btnNext.textContent = this.relayOk ? 'Next' : 'Check relay'
      if (!this.relayOk) {
        await this.runRelayCheck(this.statusEl, this.bodyEl, this.btnNext)
      }
    } else if (step.id === 'capture') {
      this.btnNext.textContent = this.captureOk ? 'Next' : 'Test capture'
      if (!this.captureOk) {
        await this.runCaptureCheck(this.statusEl, this.bodyEl, this.btnNext)
      }
    } else if (step.id === 'keys') {
      this.btnNext.textContent = 'Next'
    } else if (step.id === 'ready') {
      const parts = ['Relay OK', 'Capture OK']
      if (!this.keysSkipped) parts.push('Keys saved')
      this.statusEl.textContent = parts.join(' · ')
      this.statusEl.dataset.state = 'ok'
      this.btnNext.textContent = 'Finish setup'
    } else {
      this.btnNext.textContent = 'Next'
    }
  }

  private async runRelayCheck(
    statusEl: HTMLElement,
    bodyEl: HTMLElement,
    nextBtn: HTMLButtonElement,
  ): Promise<void> {
    statusEl.textContent = 'Checking relay…'
    statusEl.dataset.state = 'pending'
    nextBtn.disabled = true

    let snapshot = await window.tabcast.getRelay()
    if (snapshot.lifecycle !== 'ready' && snapshot.lifecycle !== 'live') {
      statusEl.textContent = 'Starting relay…'
      snapshot = await window.tabcast.startRelay()
    }

    const report = await window.tabcast.verifySystem()
    const relayCheck = report.checks.find((c) => c.name === 'relay-lifecycle')
    const healthCheck = report.checks.find((c) => c.name === 'relay-health')
    const binaryCheck = report.checks.find((c) => c.name === 'relay-binary')

    this.relayOk = Boolean(relayCheck?.ok && healthCheck?.ok && binaryCheck?.ok)

    if (this.relayOk) {
      const version = snapshot.health?.version ? ` v${snapshot.health.version}` : ''
      statusEl.textContent = `Relay online${version} — health endpoint OK`
      statusEl.dataset.state = 'ok'
      nextBtn.disabled = false
      nextBtn.textContent = 'Next'
      return
    }

    const lines = report.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`)
    statusEl.textContent = lines.join('\n')
    statusEl.dataset.state = 'fail'
    bodyEl.textContent =
      'Relay is not ready. Use Start relay in the sidebar, or run npm run fetch:relay if the binary is missing. Then click Check relay again.'
    nextBtn.disabled = false
    nextBtn.textContent = 'Check relay'
  }

  private async runCaptureCheck(
    statusEl: HTMLElement,
    bodyEl: HTMLElement,
    nextBtn: HTMLButtonElement,
  ): Promise<void> {
    statusEl.textContent = 'Listing capture sources…'
    statusEl.dataset.state = 'pending'
    nextBtn.disabled = true

    try {
      const sources = await window.tabcast.listCaptureSources()
      this.captureOk = sources.length > 0
      if (this.captureOk) {
        const screens = sources.filter((s) => s.type === 'screen').length
        const windows = sources.filter((s) => s.type === 'window').length
        const browser = sources.filter((s) => s.type === 'browser').length
        const parts: string[] = []
        if (screens) parts.push(`${screens} display${screens === 1 ? '' : 's'}`)
        if (windows) parts.push(`${windows} window${windows === 1 ? '' : 's'}`)
        if (browser) parts.push('Browse tab')
        statusEl.textContent = `Found ${sources.length} source${sources.length === 1 ? '' : 's'} (${parts.join(', ')})`
        statusEl.dataset.state = 'ok'
        nextBtn.textContent = 'Next'
      } else {
        statusEl.textContent = 'No capture sources found — check display permissions.'
        statusEl.dataset.state = 'fail'
        bodyEl.textContent =
          'Windows may block screen capture for new apps. Open Settings → Privacy → Screen capture and allow Maka, then retry.'
        nextBtn.textContent = 'Test capture'
      }
    } catch (err) {
      this.captureOk = false
      statusEl.textContent = err instanceof Error ? err.message : String(err)
      statusEl.dataset.state = 'fail'
      nextBtn.textContent = 'Test capture'
    }

    nextBtn.disabled = false
  }
}
