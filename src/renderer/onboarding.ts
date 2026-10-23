export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type TourStep = {
  id: string
  title: string
  body: string
  target?: string
  placement?: TourPlacement
}

export const ONBOARDING_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Maka',
    body: 'Maka is a streaming studio. Capture, scenes, destinations, and Go Live are the main job. Search is a separate tab for Twitch, YouTube, and chat when you need it.',
    placement: 'center',
  },
  {
    id: 'modes',
    title: 'Stream & Search',
    body: 'Stream is home: sources, the program monitor, layers, and destinations stay on screen. Search opens the in-app browser when you choose that tab.',
    target: '[data-tour="modes"]',
    placement: 'bottom',
  },
  {
    id: 'sources',
    title: 'Sources',
    body: 'Pick a display or window for the stream. Add camera and mic here. Capture the Search tab when you want that page on the program. The relay encoder runs locally on port 38473.',
    target: '[data-tour="sources"]',
    placement: 'right',
  },
  {
    id: 'program',
    title: 'Program monitor',
    body: 'This is what goes live — your gameplay or browser tab, with webcam overlay when enabled. Layers on the right toggle what the relay receives.',
    target: '[data-tour="program"]',
    placement: 'left',
  },
  {
    id: 'relay',
    title: 'Relay status',
    body: 'The relay chip shows encoder health. Start the relay from the left sidebar if it is offline. Keys never touch disk — relay RAM only.',
    target: '[data-tour="relay"]',
    placement: 'bottom',
  },
  {
    id: 'destinations',
    title: 'Destinations',
    body: 'Choose Twitch and/or YouTube, paste stream keys, verify, then go live. Third-party addons can add more platforms later via the marketplace.',
    target: '[data-tour="destinations"]',
    placement: 'left',
  },
  {
    id: 'addons',
    title: 'Addons',
    body: 'Extensions slot into the layout without replacing the core. Scene templates ship built-in; the marketplace will host community addons (alerts, new platforms, tools).',
    target: '[data-tour="addons"]',
    placement: 'left',
  },
  {
    id: 'go-live',
    title: 'Go Live',
    body: 'When source and relay are ready, hit Go Live — or press F8. End Live tears down WHIP cleanly. You can replay this tour anytime in Settings.',
    target: '[data-tour="go-live"]',
    placement: 'bottom',
  },
]

type TourOptions = {
  onComplete: () => void
  onSkip: () => void
}

export class OnboardingTour {
  private index = 0

  constructor(
    private root: HTMLElement,
    private spotlight: HTMLElement,
    private card: HTMLElement,
    private stepLabel: HTMLElement,
    private titleEl: HTMLElement,
    private bodyEl: HTMLElement,
    private btnPrev: HTMLButtonElement,
    private btnNext: HTMLButtonElement,
    private btnSkip: HTMLButtonElement,
    private options: TourOptions,
  ) {
    this.btnPrev.addEventListener('click', () => this.prev())
    this.btnNext.addEventListener('click', () => this.next())
    this.btnSkip.addEventListener('click', () => this.finish(true))
    window.addEventListener('resize', () => this.renderStep())
    window.addEventListener('scroll', () => this.renderStep(), true)
  }

  start(): void {
    this.index = 0
    this.root.hidden = false
    this.root.classList.remove('hidden')
    document.body.classList.add('onboarding-active')
    this.renderStep()
  }

  isOpen(): boolean {
    return !this.root.hidden
  }

  private finish(skipped: boolean): void {
    this.root.hidden = true
    this.root.classList.add('hidden')
    delete this.root.dataset.dim
    document.body.classList.remove('onboarding-active')
    this.spotlight.hidden = true
    if (skipped) this.options.onSkip()
    else this.options.onComplete()
  }

  private prev(): void {
    if (this.index <= 0) return
    this.index -= 1
    this.renderStep()
  }

  private next(): void {
    if (this.index >= ONBOARDING_STEPS.length - 1) {
      this.finish(false)
      return
    }
    this.index += 1
    this.renderStep()
  }

  private renderStep(): void {
    const step = ONBOARDING_STEPS[this.index]
    if (!step) return

    this.stepLabel.textContent = `${this.index + 1} / ${ONBOARDING_STEPS.length}`
    this.titleEl.textContent = step.title
    this.bodyEl.textContent = step.body
    this.btnPrev.disabled = this.index === 0
    this.btnNext.textContent =
      this.index >= ONBOARDING_STEPS.length - 1 ? 'Finish' : 'Next'

    const target = step.target ? document.querySelector(step.target) : null
    this.position(step.placement ?? 'center', target)
  }

  private position(placement: TourPlacement, target: Element | null): void {
    const pad = 10
    const margin = 16
    const cardRect = () => this.card.getBoundingClientRect()

    if (!target || placement === 'center') {
      this.spotlight.hidden = true
      this.root.dataset.dim = 'full'
      this.card.style.top = '50%'
      this.card.style.left = '50%'
      this.card.style.transform = 'translate(-50%, -50%)'
      this.card.dataset.placement = 'center'
      return
    }

    const rect = target.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) {
      this.spotlight.hidden = true
      return
    }

    this.spotlight.hidden = false
    this.root.dataset.dim = 'spotlight'
    this.spotlight.style.left = `${Math.max(0, rect.left - pad)}px`
    this.spotlight.style.top = `${Math.max(0, rect.top - pad)}px`
    this.spotlight.style.width = `${rect.width + pad * 2}px`
    this.spotlight.style.height = `${rect.height + pad * 2}px`

    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })

    this.card.style.transform = 'none'
    this.card.dataset.placement = placement

    const card = cardRect()
    let top = rect.bottom + margin
    let left = rect.left

    if (placement === 'top') {
      top = rect.top - card.height - margin
      left = rect.left + rect.width / 2 - card.width / 2
    } else if (placement === 'bottom') {
      top = rect.bottom + margin
      left = rect.left + rect.width / 2 - card.width / 2
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2 - card.height / 2
      left = rect.left - card.width - margin
    } else if (placement === 'right') {
      top = rect.top + rect.height / 2 - card.height / 2
      left = rect.right + margin
    }

    const vw = window.innerWidth
    const vh = window.innerHeight
    left = Math.max(margin, Math.min(left, vw - card.width - margin))
    top = Math.max(margin, Math.min(top, vh - card.height - margin))

    this.card.style.left = `${left}px`
    this.card.style.top = `${top}px`
  }
}
