import type { EncodeProfileId } from '../shared/stream-encode-profiles'
import {
  extractStreamKey,
  sanitizeStreamGame,
  sanitizeStreamWizardTitle,
  sanitizeYouTubeDescription,
  streamKeyValid,
  YOUTUBE_DESCRIPTION_LIMIT,
} from '../shared/stream-wizard'

export type GoLiveWizardPlatform = 'twitch' | 'youtube' | 'custom'

type WizardPlatform = 'twitch' | 'youtube'
type WizardStep = 'platform' | 'key' | 'details' | 'go'

export type GoLiveStreamInfo = {
  title: string
  game: string
  description: string
  channel: string
  includeChat: boolean
  twitchChatLink: string
  youtubeChatLink: string
}

export type GoLiveWizardBindings = {
  isLive: () => boolean
  readUi: () => {
    destTwitch: boolean
    destYoutube: boolean
    twitchKey: string
    youtubeKey: string
  }
  applyPlatform: (platform: GoLiveWizardPlatform) => void
  applyKeys: (partial: { twitchKey?: string; youtubeKey?: string }) => void
  validate: () => Promise<{ ok: boolean; message: string }>
  goLive: () => Promise<void>
  endLive: () => Promise<void>
  readEncodeProfile: () => EncodeProfileId
  applyEncodeProfile: (id: EncodeProfileId) => void
  readPreferredPlatform: () => 'twitch' | 'youtube' | 'none'
  readStreamInfo: () => GoLiveStreamInfo
  applyStreamInfo: (info: GoLiveStreamInfo) => void
}

type GameEntry = { id: string; name: string; image: string }

const STEPS: WizardStep[] = ['platform', 'key', 'details', 'go']
const GAME_LIST_ROWS = 5
const GAME_LIST_ROW_PX = 44

export class GoLiveWizard {
  private step: WizardStep = 'platform'
  private platform: WizardPlatform = 'twitch'
  private busy = false
  private keyError = ''
  private games: GameEntry[] = []
  private gamesLoaded = false
  private gameListOpen = false
  private blockDialogCancel = false

  private readonly stepLabel: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly bodyEl: HTMLElement
  private readonly panelPlatform: HTMLElement
  private readonly panelKey: HTMLElement
  private readonly panelDetails: HTMLElement
  private readonly panelGo: HTMLElement
  private readonly twitchKey: HTMLInputElement
  private readonly youtubeKey: HTMLInputElement
  private readonly keyHint: HTMLElement
  private readonly titleInput: HTMLInputElement
  private readonly descriptionField: HTMLElement
  private readonly descriptionInput: HTMLTextAreaElement
  private readonly descriptionCount: HTMLElement
  private readonly gameButton: HTMLButtonElement
  private readonly gameList: HTMLElement
  private readonly qualitySelect: HTMLSelectElement
  private readonly goStatus: HTMLElement
  private readonly gameCard: HTMLElement
  private readonly gameCardImg: HTMLImageElement
  private readonly gameCardName: HTMLElement
  private readonly btnBack: HTMLButtonElement
  private readonly btnNext: HTMLButtonElement
  private readonly btnCancel: HTMLButtonElement

  constructor(
    private dialog: HTMLDialogElement,
    private bindings: GoLiveWizardBindings,
  ) {
    const q = <T extends HTMLElement>(id: string) => {
      const el = dialog.querySelector<T>(`#${id}`)
      if (!el) throw new Error(`Missing #${id}`)
      return el
    }
    this.stepLabel = q('go-live-wizard-step')
    this.titleEl = q('go-live-wizard-title')
    this.bodyEl = q('go-live-wizard-body')
    this.panelPlatform = q('go-live-wizard-panel-platform')
    this.panelKey = q('go-live-wizard-panel-key')
    this.panelDetails = q('go-live-wizard-panel-details')
    this.panelGo = q('go-live-wizard-panel-go')
    this.twitchKey = q('wizard-twitch-key')
    this.youtubeKey = q('wizard-youtube-key')
    this.keyHint = q('wizard-key-hint')
    this.titleInput = q('go-live-wizard-title-input')
    this.descriptionField = q('go-live-wizard-description-field')
    this.descriptionInput = q<HTMLTextAreaElement>('go-live-wizard-description')
    this.descriptionCount = q('go-live-wizard-description-count')
    this.gameButton = q('go-live-wizard-game-input')
    this.gameList = q('go-live-wizard-game-list')
    this.qualitySelect = q('go-live-wizard-quality')
    this.goStatus = q('go-live-wizard-go-status')
    this.gameCard = document.getElementById('go-live-game-card') as HTMLElement
    this.gameCardImg = document.getElementById('go-live-game-card-img') as HTMLImageElement
    this.gameCardName = document.getElementById('go-live-game-card-name') as HTMLElement
    this.btnBack = q('go-live-wizard-back')
    this.btnNext = q('go-live-wizard-next')
    this.btnCancel = q('go-live-wizard-cancel')

    this.btnBack.addEventListener('click', () => this.back())
    this.btnNext.addEventListener('click', () => void this.forward())
    this.btnCancel.addEventListener('click', () => this.close())
    dialog.querySelectorAll<HTMLButtonElement>('[data-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        this.platform = button.dataset.platform === 'youtube' ? 'youtube' : 'twitch'
        this.paintPlatforms()
        this.syncKeyPanel()
        this.refreshKeyGate()
        this.syncDescriptionField()
      })
    })
    this.twitchKey.addEventListener('input', () => {
      this.keyError = ''
      this.refreshKeyGate()
    })
    this.youtubeKey.addEventListener('input', () => {
      this.keyError = ''
      this.refreshKeyGate()
    })
    this.qualitySelect.addEventListener('change', () => {
      this.bindings.applyEncodeProfile(this.qualitySelect.value as EncodeProfileId)
    })
    this.titleInput.addEventListener('change', () => this.publishDetails())
    this.descriptionInput.addEventListener('input', () => {
      this.descriptionInput.value = sanitizeYouTubeDescription(this.descriptionInput.value)
      this.paintDescriptionCount()
      this.publishDetails()
    })
    this.gameButton.addEventListener('click', () => this.setGameListOpen(!this.gameListOpen))
    this.dialog.addEventListener('cancel', (event) => {
      if (!this.gameListOpen && !this.blockDialogCancel) return
      event.preventDefault()
      this.blockDialogCancel = false
      this.setGameListOpen(false)
    })
    this.dialog.addEventListener('close', () => {
      this.busy = false
      this.setGameListOpen(false)
      this.hideGameCard()
    })
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.gameListOpen) return
        const target = event.target
        if (!(target instanceof Element)) {
          this.setGameListOpen(false)
          return
        }
        if (this.gameButton.contains(target) || this.gameList.contains(target)) return
        this.setGameListOpen(false)
      },
      true,
    )
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.gameListOpen) return
      this.blockDialogCancel = true
      event.preventDefault()
      event.stopPropagation()
      this.setGameListOpen(false)
    })
    window.addEventListener('resize', () => {
      if (this.gameListOpen) this.positionGameList()
      if (this.step === 'details') this.positionGameCard()
    })
  }

  open(): void {
    if (this.bindings.isLive()) {
      void this.bindings.endLive().finally(() => this.close())
      return
    }
    const ui = this.bindings.readUi()
    const preferred = this.bindings.readPreferredPlatform()
    if (preferred === 'youtube' || (ui.destYoutube && !ui.destTwitch)) this.platform = 'youtube'
    else this.platform = 'twitch'
    this.twitchKey.value = ui.twitchKey
    this.youtubeKey.value = ui.youtubeKey
    const profile = this.bindings.readEncodeProfile()
    if (this.qualitySelect.value !== profile) this.qualitySelect.value = profile
    const info = this.bindings.readStreamInfo()
    this.titleInput.value = info.title
    this.descriptionInput.value = sanitizeYouTubeDescription(info.description)
    this.paintDescriptionCount()
    this.paintGameTrigger(info.game, this.imageForGame(info.game))
    this.step = 'platform'
    this.busy = false
    this.goStatus.textContent = ''
    this.goStatus.dataset.state = 'idle'
    this.render()
    void this.loadGames().then(() => {
      if (this.dialog.open) this.paintGameTrigger(this.gameName(), this.imageForGame(this.gameName()))
    })
    this.dialog.showModal()
  }

  close(): void {
    this.setGameListOpen(false)
    this.hideGameCard()
    if (this.dialog.open) this.dialog.close()
  }

  private async loadGames(): Promise<void> {
    if (this.gamesLoaded) {
      this.renderGameList()
      return
    }
    const fallback: GameEntry[] = [
      { id: 'just-chatting', name: 'Just Chatting', image: 'assets/games/just-chatting.jpg' },
    ]
    try {
      const response = await fetch(new URL('data/game-catalogue.json', window.location.href).toString())
      if (!response.ok) throw new Error(String(response.status))
      const data = (await response.json()) as { games?: GameEntry[] }
      const next = (data.games ?? []).filter((row) => row?.name && row.image)
      this.games = next.length ? next : fallback
    } catch {
      this.games = fallback
    }
    this.gamesLoaded = true
    this.renderGameList()
  }

  private renderGameList(): void {
    const current = this.gameName()
    this.gameList.replaceChildren()
    for (const entry of this.games) {
      const item = document.createElement('li')
      item.className = 'game-picker-option'
      item.setAttribute('role', 'option')
      item.dataset.gameName = entry.name
      item.setAttribute('aria-selected', sanitizeStreamGame(entry.name) === current ? 'true' : 'false')
      const img = document.createElement('img')
      img.src = new URL(entry.image, window.location.href).toString()
      img.alt = ''
      const name = document.createElement('span')
      name.className = 'game-picker-option-name'
      name.textContent = entry.name
      item.append(img, name)
      item.addEventListener('click', () => this.pickGame(entry.name, entry.image))
      this.gameList.appendChild(item)
    }
  }

  private pickGame(name: string, image: string): void {
    this.paintGameTrigger(name, image)
    this.setGameListOpen(false)
    this.syncGameCard()
    this.publishDetails()
  }

  private gameName(): string {
    return sanitizeStreamGame(this.gameButton.dataset.gameName ?? '')
  }

  private imageForGame(name: string): string {
    return this.games.find((g) => g.name === name)?.image ?? ''
  }

  private paintGameTrigger(name: string, image: string): void {
    const safe = sanitizeStreamGame(name)
    this.gameButton.dataset.gameName = safe
    const label = this.gameButton.querySelector('.game-picker-trigger-label')
    if (label) label.textContent = safe || 'Pick a game'
    const existingImg = this.gameButton.querySelector('.game-picker-trigger-img')
    if (image) {
      if (existingImg instanceof HTMLImageElement) {
        existingImg.src = new URL(image, window.location.href).toString()
      } else {
        const img = document.createElement('img')
        img.className = 'game-picker-trigger-img'
        img.src = new URL(image, window.location.href).toString()
        img.alt = ''
        this.gameButton.prepend(img)
      }
    } else if (existingImg) {
      existingImg.remove()
    }
    if (this.gameCardName) this.gameCardName.textContent = safe || '—'
    if (this.gameCardImg && image) {
      this.gameCardImg.src = new URL(image, window.location.href).toString()
      this.gameCardImg.alt = safe
    }
    for (const option of this.gameList.querySelectorAll('[role="option"]')) {
      const row = option as HTMLElement
      row.setAttribute(
        'aria-selected',
        sanitizeStreamGame(row.dataset.gameName ?? '') === safe ? 'true' : 'false',
      )
    }
  }

  private setGameListOpen(open: boolean): void {
    this.gameListOpen = open
    this.gameButton.setAttribute('aria-expanded', open ? 'true' : 'false')
    const list = this.gameList
    if (!open) {
      list.hidden = true
      try {
        list.hidePopover?.()
      } catch {
        /* ignore */
      }
      return
    }
    list.hidden = false
    try {
      list.showPopover?.()
    } catch {
      /* stay on the fixed overlay */
    }
    this.positionGameList()
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }

  private positionGameList(): void {
    const rect = this.gameButton.getBoundingClientRect()
    const width = Math.max(rect.width, 220)
    const maxH = GAME_LIST_ROWS * GAME_LIST_ROW_PX + 2
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const openUp = spaceBelow < maxH && rect.top > spaceBelow
    this.gameList.style.position = 'fixed'
    this.gameList.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
    this.gameList.style.width = `${width}px`
    this.gameList.style.maxHeight = `${maxH}px`
    if (openUp) {
      this.gameList.style.top = 'auto'
      this.gameList.style.bottom = `${window.innerHeight - rect.top + 4}px`
    } else {
      this.gameList.style.bottom = 'auto'
      this.gameList.style.top = `${rect.bottom + 4}px`
    }
  }

  private hideGameCard(): void {
    const card = this.gameCard as HTMLElement & { hidePopover?: () => void }
    try {
      card.hidePopover?.()
    } catch {
      /* ignore */
    }
    card.hidden = true
  }

  private positionGameCard(): void {
    const rect = this.dialog.getBoundingClientRect()
    const width = this.gameCard.offsetWidth || 168
    let left = rect.right + 18
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    const top = rect.top + Math.max(24, (rect.height - (this.gameCard.offsetHeight || 280)) / 2)
    this.gameCard.style.left = `${Math.max(8, left)}px`
    this.gameCard.style.top = `${Math.max(8, top)}px`
  }

  private syncGameCard(): void {
    const wide = window.matchMedia('(min-width: 1101px)').matches
    if (this.step !== 'details' || !this.dialog.open || !wide) {
      this.hideGameCard()
      return
    }
    const card = this.gameCard as HTMLElement & { showPopover?: () => void }
    card.hidden = false
    try {
      card.showPopover?.()
    } catch {
      /* fixed card still shows */
    }
    this.positionGameCard()
    requestAnimationFrame(() => this.positionGameCard())
  }

  private paintPlatforms(): void {
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-platform]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.platform === this.platform ? 'true' : 'false')
    })
  }

  private syncKeyPanel(): void {
    const twitch = this.panelKey.querySelector<HTMLElement>('[data-wizard-key="twitch"]')
    const youtube = this.panelKey.querySelector<HTMLElement>('[data-wizard-key="youtube"]')
    if (twitch) twitch.hidden = this.platform !== 'twitch'
    if (youtube) youtube.hidden = this.platform !== 'youtube'
  }

  private activeKey(): string {
    return (this.platform === 'youtube' ? this.youtubeKey.value : this.twitchKey.value).trim()
  }

  private refreshKeyGate(): void {
    const value = this.activeKey()
    const ok = streamKeyValid(this.platform, value)
    if (this.step === 'key') this.btnNext.disabled = this.busy || !ok
    if (this.step === 'key' && this.keyError) {
      this.keyHint.hidden = false
      this.keyHint.textContent = this.keyError
      return
    }
    if (this.step !== 'key' || !value || ok) {
      this.keyHint.hidden = true
      this.keyHint.textContent = ''
      return
    }
    this.keyHint.hidden = false
    this.keyHint.textContent =
      this.platform === 'youtube'
        ? 'That doesn’t match a YouTube stream key (abcd-efgh-ijkl-mnop).'
        : 'That doesn’t match a Twitch stream key (live_…).'
  }

  private descriptionValue(): string {
    return this.platform === 'youtube' ? sanitizeYouTubeDescription(this.descriptionInput.value) : ''
  }

  private paintDescriptionCount(): void {
    const length = sanitizeYouTubeDescription(this.descriptionInput.value).length
    this.descriptionCount.textContent = `${length}/${YOUTUBE_DESCRIPTION_LIMIT}`
  }

  private syncDescriptionField(): void {
    this.descriptionField.hidden = this.platform !== 'youtube'
  }

  private publishDetails(): void {
    const info = this.bindings.readStreamInfo()
    this.bindings.applyStreamInfo({
      title: sanitizeStreamWizardTitle(this.titleInput.value),
      game: this.gameName(),
      description: this.descriptionValue(),
      channel: info.channel,
      includeChat: info.includeChat,
      twitchChatLink: info.twitchChatLink,
      youtubeChatLink: info.youtubeChatLink,
    })
    this.bindings.applyEncodeProfile(this.qualitySelect.value as EncodeProfileId)
  }

  private render(): void {
    if (this.step !== 'details') this.setGameListOpen(false)
    this.dialog.dataset.step = this.step
    this.panelPlatform.hidden = this.step !== 'platform'
    this.panelKey.hidden = this.step !== 'key'
    this.panelDetails.hidden = this.step !== 'details'
    this.panelGo.hidden = this.step !== 'go'
    this.paintPlatforms()
    const index = STEPS.indexOf(this.step)
    this.stepLabel.textContent = `Step ${index + 1} of ${STEPS.length}`
    this.btnBack.hidden = this.step === 'platform'
    this.btnNext.disabled = this.busy
    this.btnNext.textContent = this.step === 'go' ? (this.busy ? 'Going live…' : 'Go Live') : 'Next'
    if (this.step === 'platform') {
      this.titleEl.textContent = 'Choose a platform'
      this.bodyEl.textContent = 'Which platform would you like to stream to?'
    } else if (this.step === 'key') {
      this.titleEl.textContent = 'Stream key'
      this.bodyEl.textContent = 'Enter your stream key'
      this.syncKeyPanel()
      this.refreshKeyGate()
    } else if (this.step === 'details') {
      this.titleEl.textContent = 'Stream info'
      this.bodyEl.textContent = ''
      this.syncDescriptionField()
    }
    this.syncGameCard()
  }

  private back(): void {
    if (this.step === 'key') this.step = 'platform'
    else if (this.step === 'details') this.step = 'key'
    else if (this.step === 'go') this.step = 'details'
    this.render()
  }

  private async forward(): Promise<void> {
    if (this.busy) return
    if (this.step === 'platform') {
      this.bindings.applyPlatform(this.platform)
      this.step = 'key'
      this.render()
      return
    }
    if (this.step === 'key') {
      if (!streamKeyValid(this.platform, this.activeKey())) {
        this.refreshKeyGate()
        return
      }
      const key = extractStreamKey(this.activeKey()).slice(0, 256)
      if (this.platform === 'twitch') this.bindings.applyKeys({ twitchKey: key })
      else this.bindings.applyKeys({ youtubeKey: key })
      this.bindings.applyPlatform(this.platform)
      this.bindings.applyEncodeProfile(this.qualitySelect.value as EncodeProfileId)
      this.busy = true
      this.keyError = ''
      this.btnNext.disabled = true
      this.keyHint.hidden = false
      this.keyHint.textContent = 'Checking the relay…'
      const result = await this.bindings.validate()
      this.busy = false
      if (!result.ok) {
        this.keyError = result.message
        this.render()
        return
      }
      this.keyError = ''
      this.keyHint.hidden = true
      this.step = 'details'
      this.render()
      return
    }
    if (this.step === 'details') {
      this.publishDetails()
      this.step = 'go'
      this.render()
      return
    }
    this.publishDetails()
    this.busy = true
    this.render()
    try {
      await this.bindings.goLive()
      this.close()
    } catch (error) {
      this.goStatus.hidden = false
      this.goStatus.dataset.state = 'error'
      this.goStatus.textContent = error instanceof Error ? error.message : 'Go live failed.'
    } finally {
      this.busy = false
      if (this.dialog.open) this.render()
    }
  }
}
