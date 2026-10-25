import type { MarketplaceItem, TabcastBridge } from '../preload/index'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

type MarketplaceUi = {
  sidebarList: HTMLElement
  dialog?: {
    dialog: HTMLDialogElement
    list: HTMLElement
  }
  onRefreshPanels: () => void
  onToast: (message: string, isError?: boolean) => void
}

type RenderOptions = {
  compact?: boolean
}

export function initMarketplace(api: TabcastBridge, ui: MarketplaceUi): void {
  const rerender = () => void renderAllLists(api, ui)

  document.getElementById('marketplace-sidebar-refresh')?.addEventListener('click', () => {
    void (async () => {
      ui.sidebarList.textContent = 'Refreshing catalog…'
      await api.refreshMarketplace()
      await rerender()
      ui.onToast('Catalog refreshed')
    })()
  })

  ui.dialog?.dialog.querySelector('#marketplace-close')?.addEventListener('click', () => {
    ui.dialog!.dialog.close()
  })

  document.getElementById('marketplace-refresh')?.addEventListener('click', () => {
    void (async () => {
      if (ui.dialog) ui.dialog.list.textContent = 'Refreshing catalog…'
      await api.refreshMarketplace()
      await rerender()
      ui.onToast('Catalog refreshed')
    })()
  })

  void rerender()
}

async function renderAllLists(api: TabcastBridge, ui: MarketplaceUi): Promise<void> {
  ui.sidebarList.textContent = 'Loading catalog…'
  if (ui.dialog) ui.dialog.list.textContent = 'Loading catalog…'

  const items = await api.listMarketplace()
  paintList(ui.sidebarList, items, api, ui, { compact: true })
  if (ui.dialog) {
    paintList(ui.dialog.list, items, api, ui, { compact: false })
  }
}

function paintList(
  root: HTMLElement,
  items: MarketplaceItem[],
  api: TabcastBridge,
  ui: MarketplaceUi,
  options: RenderOptions,
): void {
  root.innerHTML = ''

  if (!items.length) {
    root.innerHTML = '<p class="hint tight">Marketplace catalog is empty.</p>'
    return
  }

  const featured = items.filter((i) => i.featured)
  const rest = items.filter((i) => !i.featured)

  if (featured.length) {
    appendSection(root, 'Featured', featured, api, ui, options)
  }
  if (rest.length) {
    appendSection(root, options.compact ? 'Extensions' : 'All extensions', rest, api, ui, options)
  }
}

function appendSection(
  root: HTMLElement,
  title: string,
  items: MarketplaceItem[],
  api: TabcastBridge,
  ui: MarketplaceUi,
  options: RenderOptions,
): void {
  const heading = document.createElement('h3')
  heading.className = 'marketplace-section-title'
  heading.textContent = title
  root.appendChild(heading)

  for (const item of items) {
    root.appendChild(renderCard(item, api, ui, options))
  }
}

function renderCard(
  item: MarketplaceItem,
  api: TabcastBridge,
  ui: MarketplaceUi,
  options: RenderOptions,
): HTMLElement {
  const card = document.createElement('article')
  card.className = 'marketplace-card' + (item.featured ? ' featured' : '')
  if (options.compact) card.classList.add('marketplace-card-compact')
  card.dataset.catalogId = item.catalogId

  const perms =
    item.permissions.length > 0
      ? item.permissions.map((p) => `<code>${escapeHtml(p)}</code>`).join(' ')
      : '<span class="hint tight">No special permissions</span>'

  const permsBlock = options.compact
    ? ''
    : `<p class="marketplace-perms">${perms}</p>`

  const metaLine = options.compact
    ? ''
    : `<span class="marketplace-meta">${escapeHtml(item.version)} · ${escapeHtml(item.author ?? 'Community')}</span>`

  card.innerHTML = `
    <header class="marketplace-card-head">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        ${metaLine}
      </div>
      <span class="marketplace-badge" data-kind="${escapeHtml(item.category ?? 'utility')}">${escapeHtml(item.category ?? 'utility')}</span>
    </header>
    <p class="hint tight">${escapeHtml(item.description ?? '')}</p>
    ${permsBlock}
    <div class="marketplace-card-actions"></div>
  `

  const actions = card.querySelector('.marketplace-card-actions')!

  if (item.builtin) {
    const tag = document.createElement('span')
    tag.className = 'marketplace-status'
    tag.textContent = 'Built into core'
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
          void renderAllLists(api, ui)
        }
      })()
    })
    actions.appendChild(toggle)

    if (!options.compact) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = 'Uninstall'
      remove.addEventListener('click', () => {
        void (async () => {
          const res = await api.uninstallAddon(item.id)
          ui.onToast(res.message ?? (res.ok ? 'Removed' : 'Failed'), !res.ok)
          if (res.ok) {
            ui.onRefreshPanels()
            void renderAllLists(api, ui)
          }
        })()
      })
      actions.appendChild(remove)
    }
  } else {
    const install = document.createElement('button')
    install.type = 'button'
    install.className = options.compact ? 'primary marketplace-install-compact' : 'primary'
    install.textContent = 'Install'
    install.addEventListener('click', () => {
      void (async () => {
        install.disabled = true
        const res = await api.installAddon(item.catalogId)
        ui.onToast(res.message ?? (res.ok ? 'Installed' : 'Failed'), !res.ok)
        install.disabled = false
        if (res.ok) {
          ui.onRefreshPanels()
          void renderAllLists(api, ui)
        }
      })()
    })
    actions.appendChild(install)
  }

  return card
}
