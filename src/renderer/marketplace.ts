import type { MarketplaceItem, TabcastBridge } from '../preload/index'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

type MarketplaceUi = {
  dialog: HTMLDialogElement
  list: HTMLElement
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
      ui.list.textContent = 'Refreshing catalog…'
      await api.refreshMarketplace()
      await rerender()
      ui.onToast('Catalog refreshed')
    })()
  })

  void rerender()
}

async function renderCatalog(api: TabcastBridge, ui: MarketplaceUi): Promise<void> {
  ui.list.textContent = 'Loading catalog…'

  const items = await api.listMarketplace()
  paintList(ui.list, items, api, ui)
}

function paintList(
  root: HTMLElement,
  items: MarketplaceItem[],
  api: TabcastBridge,
  ui: MarketplaceUi,
): void {
  root.innerHTML = ''

  if (!items.length) {
    root.innerHTML = '<p class="hint tight">Marketplace catalog is empty.</p>'
    return
  }

  const featured = items.filter((i) => i.featured)
  const rest = items.filter((i) => !i.featured)

  if (featured.length) {
    appendSection(root, 'Featured', featured, api, ui)
  }
  if (rest.length) {
    appendSection(root, 'All extensions', rest, api, ui)
  }
}

function appendSection(
  root: HTMLElement,
  title: string,
  items: MarketplaceItem[],
  api: TabcastBridge,
  ui: MarketplaceUi,
): void {
  const heading = document.createElement('h3')
  heading.className = 'marketplace-section-title'
  heading.textContent = title
  root.appendChild(heading)

  for (const item of items) {
    root.appendChild(renderCard(item, api, ui))
  }
}

function renderCard(item: MarketplaceItem, api: TabcastBridge, ui: MarketplaceUi): HTMLElement {
  const card = document.createElement('article')
  card.className = 'marketplace-card' + (item.featured ? ' featured' : '')
  card.dataset.catalogId = item.catalogId

  const perms =
    item.permissions.length > 0
      ? item.permissions.map((p) => `<code>${escapeHtml(p)}</code>`).join(' ')
      : '<span class="hint tight">No special permissions</span>'

  card.innerHTML = `
    <header class="marketplace-card-head">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="marketplace-meta">${escapeHtml(item.version)} · ${escapeHtml(item.author ?? 'Community')}</span>
      </div>
      <span class="marketplace-badge" data-kind="${escapeHtml(item.category ?? 'utility')}">${escapeHtml(item.category ?? 'utility')}</span>
    </header>
    <p class="hint tight">${escapeHtml(item.description ?? '')}</p>
    <p class="marketplace-perms">${perms}</p>
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
          void renderCatalog(api, ui)
        }
      })()
    })
    actions.appendChild(toggle)

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = 'Uninstall'
    remove.addEventListener('click', () => {
      void (async () => {
        const res = await api.uninstallAddon(item.id)
        ui.onToast(res.message ?? (res.ok ? 'Removed' : 'Failed'), !res.ok)
        if (res.ok) {
          ui.onRefreshPanels()
          void renderCatalog(api, ui)
        }
      })()
    })
    actions.appendChild(remove)
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
          void renderCatalog(api, ui)
        }
      })()
    })
    actions.appendChild(install)
  }

  return card
}
