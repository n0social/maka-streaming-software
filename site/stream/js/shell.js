/**
 * Studio shell — layout init and overflow containment.
 * Boots program preview via initPreview(root); other modules own their hooks.
 *
 * Wiring layer 2 (P1-2 / P1-3):
 *   - Studio layout only (web client has no Browser Mode)
 *   - #marketplace-dialog catalog (bundled /marketplace.json or remote feed)
 */

import { initPreview } from "./preview.js";

const NARROW_MQ = "(max-width: 960px)";
const MARKETPLACE_URLS = [
  "/marketplace.json",
  "https://makalive.stream.skydav.work/marketplace.json",
  "https://makalive.stream/marketplace.json",
];

function resolvePreviewRoot(root) {
  return (
    root.querySelector("#studio-preview") ||
    root.querySelector("#program") ||
    root.querySelector(".program") ||
    root.querySelector(".program-frame") ||
    null
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeCatalogEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const manifest = item.manifest && typeof item.manifest === "object" ? item.manifest : item;
    const catalogId = String(item.catalogId || manifest.id || "").trim();
    if (!catalogId) continue;
    out.push({
      catalogId,
      featured: Boolean(item.featured),
      name: String(manifest.name || catalogId),
      version: String(manifest.version || ""),
      author: String(manifest.author || "Community"),
      category: String(manifest.category || "utility"),
      description: String(manifest.description || ""),
      permissions: Array.isArray(manifest.permissions) ? manifest.permissions.map(String) : [],
      builtin: Boolean(manifest.builtin || item.builtin),
    });
  }
  return out;
}

async function fetchMarketplaceCatalog() {
  for (const url of MARKETPLACE_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store", mode: "cors" });
      if (!res.ok) continue;
      const data = await res.json();
      const entries = normalizeCatalogEntries(data);
      if (entries.length) return { entries, source: url };
    } catch {
      /* try next */
    }
  }
  return { entries: [], source: null };
}

function renderMarketplaceCard(item, compact) {
  const card = document.createElement("article");
  card.className =
    "marketplace-card" +
    (item.featured ? " featured" : "") +
    (compact ? " marketplace-card--compact" : "");
  card.dataset.catalogId = item.catalogId;
  card.setAttribute("role", "listitem");

  const perms =
    item.permissions.length > 0
      ? item.permissions.map((p) => `<code>${escapeHtml(p)}</code>`).join(" ")
      : '<span class="hint tight">No special permissions</span>';

  const description = escapeHtml(item.description);
  const descBlock = compact
    ? `<p class="hint tight marketplace-card-blurb">${description}</p>`
    : `<p class="hint tight">${description}</p>`;

  card.innerHTML = `
    <header class="marketplace-card-head">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="marketplace-meta">${escapeHtml(item.version)} · ${escapeHtml(item.author)}</span>
      </div>
      <span class="marketplace-badge" data-kind="${escapeHtml(item.category)}">${escapeHtml(item.category)}</span>
    </header>
    ${descBlock}
    ${compact ? "" : `<p class="marketplace-perms">${perms}</p>`}
    <div class="marketplace-card-actions"></div>
  `;

  const actions = card.querySelector(".marketplace-card-actions");
  const tag = document.createElement("span");
  tag.className = "marketplace-status";
  tag.textContent = item.builtin
    ? compact
      ? "Core"
      : "Built into core"
    : compact
      ? "Browse"
      : "Desktop install only";
  actions.appendChild(tag);
  return card;
}

function paintMarketplaceList(root, entries, options) {
  const compact = Boolean(options && options.compact);
  const sections = Boolean(options && options.sections);
  root.innerHTML = "";
  if (!entries.length) {
    root.innerHTML = compact
      ? '<p class="hint tight marketplace-preview-empty">No addons in catalog.</p>'
      : '<p class="hint tight">Marketplace catalog is empty or could not be loaded.</p>';
    return;
  }

  const append = (items) => {
    for (const item of items) root.appendChild(renderMarketplaceCard(item, compact));
  };

  if (sections) {
    const featured = entries.filter((i) => i.featured);
    const rest = entries.filter((i) => !i.featured);
    if (featured.length) {
      const h = document.createElement("h3");
      h.className = "marketplace-section-title";
      h.textContent = "Featured";
      root.appendChild(h);
      append(featured);
    }
    if (rest.length) {
      const h = document.createElement("h3");
      h.className = "marketplace-section-title";
      h.textContent = "All extensions";
      root.appendChild(h);
      append(rest);
    }
    return;
  }

  const ordered = [...entries.filter((i) => i.featured), ...entries.filter((i) => !i.featured)];
  append(ordered.slice(0, compact ? 4 : ordered.length));
}

function initMarketplace(doc = document) {
  const dialog = doc.getElementById("marketplace-dialog");
  const list = doc.getElementById("marketplace-list");
  const preview = doc.getElementById("marketplace-sidebar-list");
  const openBtn = doc.getElementById("btn-open-marketplace");
  const closeBtn = doc.getElementById("marketplace-close");
  const refreshBtn = doc.getElementById("marketplace-refresh");
  if (!dialog || !list) return null;

  let cache = [];
  let loading = false;

  const setLoading = (message) => {
    list.textContent = message;
    if (preview) preview.textContent = message;
  };

  const paint = (entries) => {
    cache = entries;
    paintMarketplaceList(list, entries, { compact: false, sections: true });
    if (preview) paintMarketplaceList(preview, entries, { compact: true, sections: false });
  };

  const load = async () => {
    if (loading) return;
    loading = true;
    setLoading("Loading catalog…");
    const { entries, source } = await fetchMarketplaceCatalog();
    paint(entries);
    if (!entries.length) {
      setLoading("Could not load marketplace catalog.");
    } else if (source && source.indexOf("http") === 0) {
      const note = document.createElement("p");
      note.className = "hint tight marketplace-source-note";
      note.textContent = "Feed: " + source;
      list.appendChild(note);
    }
    loading = false;
  };

  openBtn?.addEventListener("click", () => {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    if (!cache.length) void load();
  });

  closeBtn?.addEventListener("click", () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  });

  refreshBtn?.addEventListener("click", () => {
    void load();
  });

  void load();

  return { load, dialog };
}

/** Web client is Studio-only — always return studio. */
function readStartupMode() {
  return "studio";
}

/**
 * Lock the three-column studio layout. Browser Mode is not offered on web.
 * @param {'studio' | 'browse'} [_mode] Ignored; always studio.
 * @param {{ persist?: boolean, fromSettings?: boolean }} [_opts]
 */
function applyOutputMode(_mode, _opts = {}) {
  const mode = "studio";
  const app = document.getElementById("studio-app") || document.querySelector(".app");
  const body = document.body;
  const brandTag = document.getElementById("brand-tag");

  document.documentElement.dataset.makaStartupMode = mode;

  if (app) {
    app.dataset.outputMode = mode;
    app.dataset.shell = "studio";
  }

  // Don't clobber Settings mode; restore studio when leaving settings.
  if (body.dataset.mode !== "settings") {
    body.dataset.mode = mode;
  } else {
    body.dataset.outputModePending = mode;
  }

  if (brandTag && body.dataset.mode !== "settings") {
    brandTag.hidden = false;
    brandTag.textContent = "Streaming studio";
  }

  // Keep program-browser slot hidden (desktop built-in browser is not available here).
  const programBrowser = document.getElementById("program-browser");
  if (programBrowser) {
    programBrowser.hidden = true;
    delete programBrowser.dataset.webMock;
    const note = programBrowser.querySelector(".program-browser-web-note");
    if (note) note.remove();
  }

  window.dispatchEvent(
    new CustomEvent("maka:output-mode-change", { detail: { mode } }),
  );
}

function initOutputMode() {
  applyOutputMode("studio", { persist: false, fromSettings: true });

  // Settings close always restores studio chrome (brand tag, .app dataset).
  window.addEventListener("maka:close-settings-done", () => {
    delete document.body.dataset.outputModePending;
    applyOutputMode("studio", { persist: false });
  });

  return { applyOutputMode, readStartupMode };
}

/**
 * Lock the studio grid so the center column cannot expand the page.
 * Uses minmax(0, 1fr) + overflow hidden on .app / .stage / .program-column.
 */
export function initShell(root = document) {
  const app =
    root.querySelector(".app") ||
    root.getElementById("studio-app") ||
    root.querySelector(".stream-app") ||
    document.body;

  const body = document.body;
  body.classList.add("stream-studio");
  if (!body.dataset.mode) body.dataset.mode = "studio";

  const stage =
    (app && app.querySelector && app.querySelector(".stage")) ||
    (app && app.querySelector && app.querySelector(".stream-stage-wrap")) ||
    null;
  const programColumn = app && app.querySelector ? app.querySelector(".program-column") : null;
  const program = resolvePreviewRoot(root) || resolvePreviewRoot(app || document);

  const lockOverflow = () => {
    const narrow = window.matchMedia(NARROW_MQ).matches;
    if (app && app.style) {
      app.style.minWidth = "0";
      app.style.minHeight = "0";
    }

    if (!narrow) {
      if (app && app.style) app.style.overflow = "hidden";
      if (stage) {
        stage.style.minWidth = "0";
        stage.style.minHeight = "0";
        stage.style.overflow = "hidden";
      }
      if (programColumn) {
        programColumn.style.minWidth = "0";
        programColumn.style.minHeight = "0";
        programColumn.style.overflow = "hidden";
      }
      if (program) {
        program.style.minWidth = "0";
        program.style.minHeight = "0";
        program.style.overflow = "hidden";
      }
      body.style.overflow = "hidden";
    } else {
      if (app && app.style) app.style.overflow = "";
      body.style.overflow = "";
      if (stage) stage.style.overflow = "";
      if (programColumn) programColumn.style.overflow = "";
      if (program) program.style.overflow = "";
    }
  };

  lockOverflow();

  const mq = window.matchMedia(NARROW_MQ);
  const onMq = () => lockOverflow();
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", onMq);
  else mq.addListener(onMq);

  const onResize = () => lockOverflow();
  window.addEventListener("resize", onResize);

  // Program / preview capture (getDisplayMedia + getUserMedia), contained 16:9.
  const preview = program ? initPreview(program) : null;

  const outputMode = initOutputMode(document);
  const marketplace = initMarketplace(document);

  if (app && app.dataset) app.dataset.shellReady = "1";

  window.MakaShell = {
    applyOutputMode,
    readStartupMode,
    marketplace,
  };

  return {
    app,
    preview,
    outputMode,
    marketplace,
    teardown() {
      window.removeEventListener("resize", onResize);
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onMq);
      else mq.removeListener(onMq);
      if (preview && typeof preview.destroy === "function") preview.destroy();
    },
  };
}

const boot = initShell(document);
export default boot;
