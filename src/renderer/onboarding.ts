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
    body: 'Maka is a streaming studio. Scenes, sources, the program, and Go Live are the main job. This tour shows where each one lives. You can skip it and replay it later from Settings.',
    placement: 'center',
  },
  {
    id: 'modes',
    title: 'Maka',
    body: 'The gold mark is the studio. The version next to it is the build you are running. Relay status sits on the right.',
    target: '[data-tour="modes"]',
    placement: 'bottom',
  },
  {
    id: 'sources',
    title: 'Sources',
    body: 'Pick a display or window for the stream. Webcam, microphone, chat, and notifications are in this list too.',
    target: '[data-tour="sources"]',
    placement: 'right',
  },
  {
    id: 'program',
    title: 'Program monitor',
    body: 'This is what goes on the stream: the scene, your capture, and any chat or notification cards you turned on.',
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
    title: 'Twitch and YouTube',
    body: 'The Twitch and YouTube buttons save that platform’s stream key and the chat and notifications link. Go Live fills those in for the platform you pick.',
    target: '[data-tour="destinations"]',
    placement: 'left',
  },
  {
    id: 'addons',
    title: 'Addons',
    body: 'Extensions slot into the layout without replacing the core. The marketplace hosts community addons (alerts, new platforms, tools).',
    target: '[data-tour="addons"]',
    placement: 'left',
  },
  {
    id: 'go-live',
    title: 'Go Live',
    body: 'When source and relay are ready, hit Go Live — or press F8. End Stream tears the session down. You can replay this tour anytime in Settings.',
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
