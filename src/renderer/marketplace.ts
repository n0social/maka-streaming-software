import type { MarketplaceItem, TabcastBridge } from '../preload/index'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

type ListVariant = 'full' | 'compact'

type PaintListOptions = {
  variant: ListVariant
  sections?: boolean
}

type MarketplaceUi = {
  dialog: HTMLDialogElement
  list: HTMLElement
  preview?: HTMLElement | null
  openControl?: HTMLElement | null
  onRefreshPanels: () => void
  onToast: (message: string, isError?: boolean) => void
}

export function initMarketplace(api: TabcastBridge, ui: MarketplaceUi): void {
  if (!ui.list || !ui.dialog) {
    console.error('initMarketplace: #marketplace-list or #marketplace-dialog is missing from the DOM')
    return
  }

  const rerender = () => void renderCatalog(api, ui)

  ui.openControl?.addEventListener('click', () => {
    if (!ui.dialog.open) {
      ui.dialog.showModal()
    }
  })

  ui.dialog.querySelector('#marketplace-close')?.addEventListener('click', () => {
    ui.dialog.close()
  })

  document.getElementById('marketplace-refresh')?.addEventListener('click', () => {
    void (async () => {
      setCatalogLoading(ui, 'Refreshing catalog…')
      await api.refreshMarketplace()
      await rerender()
      ui.onToast('Catalog refreshed')
    })()
  })

  void rerender()
}

function setCatalogLoading(ui: MarketplaceUi, message: string): void {
  ui.list.textContent = message
  if (ui.preview) ui.preview.textContent = message
}

async function renderCatalog(api: TabcastBridge, ui: MarketplaceUi): Promise<void> {
  setCatalogLoading(ui, 'Loading catalog…')
  const items = await api.listMarketplace()
  paintCatalogSurfaces(ui, items, api)
}

function orderMarketplaceItems(items: MarketplaceItem[]): MarketplaceItem[] {
  const featured = items.filter((i) => i.featured)
  const rest = items.filter((i) => !i.featured)
  return [...featured, ...rest]
}

function paintCatalogSurfaces(ui: MarketplaceUi, items: MarketplaceItem[], api: TabcastBridge): void {
  paintList(ui.list, items, api, ui, { variant: 'full', sections: true })
  if (ui.preview) {
    paintList(ui.preview, items, api, ui, { variant: 'compact', sections: false })
  }
}

function paintList(
  root: HTMLElement,
  items: MarketplaceItem[],
  api: TabcastBridge,
  ui: MarketplaceUi,
  options: PaintListOptions,
): void {
  root.innerHTML = ''

  if (!items.length) {
    const empty =
      options.variant === 'compact'
        ? '<p class="hint tight marketplace-preview-empty">No addons in catalog.</p>'
        : '<p class="hint tight">Marketplace catalog is empty.</p>'
    root.innerHTML = empty
    return
  }

  if (options.sections) {
    const featured = items.filter((i) => i.featured)
    const rest = items.filter((i) => !i.featured)
    if (featured.length) appendSection(root, 'Featured', featured, api, ui, options.variant)
    if (rest.length) appendSection(root, 'All extensions', rest, api, ui, options.variant)
    return
  }

  for (const item of orderMarketplaceItems(items)) {
    root.appendChild(renderCard(item, api, ui, options.variant))
  }
}

function appendSection(
  root: HTMLElement,
  title: string,
  items: MarketplaceItem[],
  api: TabcastBridge,
  ui: MarketplaceUi,
  variant: ListVariant,
): void {
  const heading = document.createElement('h3')
  heading.className = 'marketplace-section-title'
  heading.textContent = title
  root.appendChild(heading)
  for (const item of items) {
    root.appendChild(renderCard(item, api, ui, variant))
  }
}

function renderCard(
  item: MarketplaceItem,
  api: TabcastBridge,
  ui: MarketplaceUi,
  variant: ListVariant,
): HTMLElement {
  const compact = variant === 'compact'
  const card = document.createElement('article')
  card.className =
    'marketplace-card' +
    (item.featured ? ' featured' : '') +
    (compact ? ' marketplace-card--compact' : '')
  card.dataset.catalogId = item.catalogId

  const perms =
    item.permissions.length > 0
      ? item.permissions.map((p) => `<code>${escapeHtml(p)}</code>`).join(' ')
      : '<span class="hint tight">No special permissions</span>'

  const description = escapeHtml(item.description ?? '')
  const descBlock = compact
    ? `<p class="hint tight marketplace-card-blurb">${description}</p>`
    : `<p class="hint tight">${description}</p>`

  card.innerHTML = `
    <header class="marketplace-card-head">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="marketplace-meta">${escapeHtml(item.version)} · ${escapeHtml(item.author ?? 'Community')}</span>
      </div>
      <span class="marketplace-badge" data-kind="${escapeHtml(item.category ?? 'utility')}">${escapeHtml(item.category ?? 'utility')}</span>
    </header>
    ${descBlock}
    ${compact ? '' : `<p class="marketplace-perms">${perms}</p>`}
    <div class="marketplace-card-actions"></div>
  `

  const actions = card.querySelector('.marketplace-card-actions')!
  const afterMutation = () => void renderCatalog(api, ui)

  if (item.builtin) {
    const tag = document.createElement('span')
    tag.className = 'marketplace-status'
    tag.textContent = compact ? 'Core' : 'Built into core'
    actions.appendChild(tag)
  } else if (item.installed) {
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.textContent = item.enabled ? 'Disable' : 'Enable'
    toggle.addEventListener('click', () => {
      void (async () => {
        const res = await api.setAddonEnabled(item.id, !item.enabled)
        ui.onToast(res.message ?? (res.ok ? 'Updated' : 'Failed'), !res.ok)
        if (res.ok) {
          await api.reloadAddons()
          ui.onRefreshPanels()
          await afterMutation()
        }
      })()
    })
    actions.appendChild(toggle)

    if (!compact) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = 'Uninstall'
      remove.addEventListener('click', () => {
        void (async () => {
          const res = await api.uninstallAddon(item.id)
          ui.onToast(res.message ?? (res.ok ? 'Removed' : 'Failed'), !res.ok)
          if (res.ok) {
            ui.onRefreshPanels()
            await afterMutation()
          }
        })()
      })
      actions.appendChild(remove)
    }
  } else {
    const install = document.createElement('button')
    install.type = 'button'
    install.className = 'primary'
    install.textContent = 'Install'
    install.addEventListener('click', () => {
      void (async () => {
        install.disabled = true
        const res = await api.installAddon(item.catalogId)
        ui.onToast(res.message ?? (res.ok ? 'Installed' : 'Failed'), !res.ok)
        install.disabled = false
        if (res.ok) {
          ui.onRefreshPanels()
          await afterMutation()
        }
      })()
    })
    actions.appendChild(install)
  }

  return card
}
