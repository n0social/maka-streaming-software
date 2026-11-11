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
    title: 'Welcome',
    body: 'Quick look around. I’ll point at the parts you’ll actually use.',
    placement: 'center',
  },
  {
    id: 'modes',
    title: 'This is home',
    body: 'The gold M is Maka. The little number next to it is your version.',
    target: '[data-tour="modes"]',
    placement: 'bottom',
  },
  {
    id: 'sources',
    title: 'What you capture',
    body: 'Pick your screen or a window. Camera, mic, chat, and alerts are in this list too.',
    target: '[data-tour="sources"]',
    placement: 'right',
  },
  {
    id: 'program',
    title: 'What people see',
    body: 'This big window is the stream. Your scene, game, chat, and alerts show up here.',
    target: '[data-tour="program"]',
    placement: 'left',
  },
  {
    id: 'relay',
    title: 'Ready to send',
    body: 'This light turns on when Maka opens, and it turns off when you close the app.',
    target: '[data-tour="relay"]',
    placement: 'bottom',
  },
  {
    id: 'destinations',
    title: 'Twitch and YouTube',
    body: 'Save your key and chat link here. Go Live fills them in for the one you pick.',
    target: '[data-tour="destinations"]',
    placement: 'left',
  },
  // Marketplace tour returns when the addon catalog is part of the build.
  // {
  //   id: 'addons',
  //   title: 'Extras',
  //   body: 'Want something extra? Browse addons for new tools and layouts.',
  //   target: '[data-tour="addons"]',
  //   placement: 'left',
  // },
  {
    id: 'go-live',
    title: 'Go Live',
    body: 'Hit Go Live, or press F8. When you’re live, that same button says End Stream.',
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
