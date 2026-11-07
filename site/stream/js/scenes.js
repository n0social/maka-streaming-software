/**
 * Maka Stream — Scenes + Sources panel (browser port of Electron studio left rail).
 *
 * Click contract (with preview.js — do not double-fire):
 *   - Source row (.studio-source-toggle) click → toggle layer visibility / enabled only
 *     (toggleLayerForSourceKind). Never starts getDisplayMedia / getUserMedia.
 *   - Source ⋯ menu ([data-source-menu]) → expand/collapse the device picker only.
 *   - Capture is owned by preview.js explicit controls (Share screen / Add webcam on the
 *     program stage, or legacy #btn-screen / #btn-webcam). preview must not bind
 *     #studio-source-game / #studio-source-webcam for capture.
 *   - Scene row click → selectScene immediately (program overlay + maka:scene-change).
 *     No desktop-app dialog. No Add Scene — download CTA instead.
 *
 * Canonical scenes (fixed): Gameplay, Starting Soon, Intermission, Ending.
 *
 * Expected DOM (shell may provide these; otherwise this module builds them under #studio-scenes):
 *
 *   #studio-scenes[data-region="scenes"]
 *     .studio-block
 *       .studio-block-head > h2 (Scenes)
 *       #studio-scenes-list.studio-list.studio-list--scenes
 *         li > button.studio-list-item[data-scene][data-active]
 *           .studio-list-leading.scene-icon
 *           .studio-list-text
 *           .studio-list-menu.studio-list-menu--static
 *         #studio-scenes-download-row > a.studio-list-download
 *     .studio-block
 *       .studio-block-head > h2 (Sources) + #btn-refresh-sources.studio-icon-btn
 *       ul.studio-list.studio-source-list (#studio-sources-list)
 *         li.studio-source-group
 *           button.studio-list-item.studio-source-toggle#studio-source-{game|webcam|mic|browser|chat|notifications}
 *             [data-source-kind][data-enabled][data-active][aria-expanded][aria-controls]
 *             .studio-list-menu[data-source-menu]
 *           ul.studio-source-picker#source-picker-{kind}[hidden]
 *     .studio-footer > #studio-status-dot + #studio-status-text
 *
 * Events (bubbled on #studio-scenes and window):
 *   maka:scene-change   { sceneId, scene, name, card, webcamPip, layers }
 *   maka:scenes-change  { scenes, activeSceneId, customScenes: [] }
 *   maka:sources-change { layers, active }
 *
 * Persists to localStorage key `maka.stream.scenes.v1` (activeSceneId + layers only;
 * custom scenes are ignored and dropped on write). No native capture.
 * Classic script: auto-boots. Module/shell callers: window.initScenes(root?).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'maka.stream.scenes.v1';
  var DOWNLOAD_HREF = '/download.html';
  var DOWNLOAD_LABEL = 'Download the exe for the full experience';

  var BUILTIN_SCENES = [
    { id: 'gaming-cam', name: 'Gameplay', icon: '🎮', builtin: true },
    { id: 'starting-soon', name: 'Starting Soon', icon: '▶', builtin: true },
    { id: 'intermission', name: 'Intermission', icon: '❚❚', builtin: true },
    { id: 'ending', name: 'Ending', icon: '■', builtin: true },
  ];

  /** Maka-branded on-program bumper cards (Starting Soon / Intermission / Ending). */
  var BUMPER_PRESETS = {
    'starting-soon': {
      id: 'starting-soon',
      title: 'Starting Soon',
      subtitle: 'Maka is warming up — hang tight',
      brand: 'MAKA',
    },
    intermission: {
      id: 'intermission',
      title: 'Intermission',
      subtitle: 'Be right back — Maka streams on',
      brand: 'MAKA',
    },
    ending: {
      id: 'ending',
      title: 'Ending',
      subtitle: 'Thanks for watching with Maka — see you next stream',
      brand: 'MAKA',
    },
  };

  var CANONICAL_IDS = BUILTIN_SCENES.map(function (s) {
    return s.id;
  });

  var SOURCE_KINDS = ['game', 'webcam', 'mic', 'browser', 'chat', 'notifications'];

  var SOURCE_META = {
    game: { id: 'studio-source-game', label: 'Game Capture', icon: '🎮', picker: 'source-picker-game', menuLabel: 'Pick display or window' },
    webcam: { id: 'studio-source-webcam', label: 'Webcam', icon: '📹', picker: 'source-picker-webcam', menuLabel: 'Pick camera' },
    mic: { id: 'studio-source-mic', label: 'Microphone', icon: '🎙', picker: 'source-picker-mic', menuLabel: 'Pick microphone' },
    browser: { id: 'studio-source-browser', label: 'Overlay', icon: '🌐', picker: 'source-picker-browser', menuLabel: 'Overlay options' },
    chat: { id: 'studio-source-chat', label: 'Chat', icon: '💬', picker: 'source-picker-chat', menuLabel: 'Pick chat source' },
    notifications: {
      id: 'studio-source-notifications',
      label: 'Notifications',
      icon: '🔔',
      picker: 'source-picker-notifications',
      menuLabel: 'Notification options',
    },
  };

  /** @type {{ id: string, name: string, icon: string, builtin?: boolean }[]} */
  var scenes = BUILTIN_SCENES.map(cloneScene);
  var activeSceneId = 'gaming-cam';

  var layers = {
    game: true,
    cam: true,
    mic: true,
    browser: false,
    overlay: false,
    chat: false,
    notifications: false,
  };

  var sourceActive = {
    game: false,
    webcam: false,
    mic: false,
    browser: false,
    chat: false,
    notifications: false,
  };

  var expandedSourceKind = null;
  var root = null;
  var scenesList = null;
  var booted = false;

  function cloneScene(s) {
    return { id: s.id, name: s.name, icon: s.icon, builtin: !!s.builtin };
  }

  function isCanonicalSceneId(id) {
    return CANONICAL_IDS.indexOf(id) >= 0;
  }

  function isBumperSceneId(id) {
    return Object.prototype.hasOwnProperty.call(BUMPER_PRESETS, id);
  }

  function bumperPreset(id) {
    return BUMPER_PRESETS[id] || null;
  }

  function findScene(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].id === id) return scenes[i];
    }
    return null;
  }

  function readStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function writeStorage() {
    var payload = {
      activeSceneId: activeSceneId,
      customScenes: [],
      customOrder: [],
      layers: {
        game: !!layers.game,
        cam: !!layers.cam,
        mic: !!layers.mic,
        browser: !!layers.browser,
        overlay: !!layers.overlay,
        chat: !!layers.chat,
        notifications: !!layers.notifications,
      },
      sourceActive: {
        game: !!sourceActive.game,
        webcam: !!sourceActive.webcam,
        mic: !!sourceActive.mic,
        browser: !!sourceActive.browser,
        chat: !!sourceActive.chat,
        notifications: !!sourceActive.notifications,
      },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      /* quota / private mode */
    }
  }

  function loadState() {
    scenes = BUILTIN_SCENES.map(cloneScene);

    var data = readStorage();
    if (!data || typeof data !== 'object') return;

    var wanted = typeof data.activeSceneId === 'string' ? data.activeSceneId : 'gaming-cam';
    // Drop legacy Just Chatting / custom-* active ids onto Gameplay.
    activeSceneId = isCanonicalSceneId(wanted) ? wanted : 'gaming-cam';

    if (data.layers && typeof data.layers === 'object') {
      Object.keys(layers).forEach(function (key) {
        if (typeof data.layers[key] === 'boolean') layers[key] = data.layers[key];
      });
    }
    if (data.sourceActive && typeof data.sourceActive === 'object') {
      Object.keys(sourceActive).forEach(function (key) {
        if (typeof data.sourceActive[key] === 'boolean') sourceActive[key] = data.sourceActive[key];
      });
    }
  }

  function emit(name, detail) {
    var event = new CustomEvent(name, { bubbles: true, detail: detail });
    if (root) root.dispatchEvent(event);
    global.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail }));
  }

  function previewSceneDetail(scene) {
    var bumper = scene ? bumperPreset(scene.id) : null;
    var webcamPip = scene ? scene.id === 'gaming-cam' : false;
    return {
      sceneId: scene ? scene.id : activeSceneId,
      scene: scene ? cloneScene(scene) : null,
      name: scene ? scene.name : '',
      card: bumper
        ? {
            id: bumper.id,
            title: bumper.title,
            subtitle: bumper.subtitle,
            brand: bumper.brand,
          }
        : null,
      webcamPip: webcamPip && layers.cam,
      layers: {
        game: layers.game,
        cam: layers.cam,
        mic: layers.mic,
        browser: layers.browser,
        overlay: layers.overlay,
        chat: layers.chat,
        notifications: layers.notifications,
      },
    };
  }

  function emitAll() {
    writeStorage();
    var scene = findScene(activeSceneId);
    emit('maka:scene-change', previewSceneDetail(scene));
    emit('maka:scenes-change', {
      scenes: scenes.map(cloneScene),
      activeSceneId: activeSceneId,
      customScenes: [],
    });
    emit('maka:sources-change', {
      layers: {
        game: layers.game,
        cam: layers.cam,
        mic: layers.mic,
        browser: layers.browser,
        overlay: layers.overlay,
        chat: layers.chat,
        notifications: layers.notifications,
      },
      active: Object.assign({}, sourceActive),
    });
  }

  function applySceneLayerDefaults(sceneId) {
    if (sceneId === 'gaming-cam') {
      layers.game = true;
      layers.cam = true;
    } else if (isBumperSceneId(sceneId)) {
      layers.game = false;
      layers.cam = false;
    }
  }

  function ensureRoot(mount) {
    if (mount && mount.nodeType === 1) {
      root = mount;
      if (!root.id) root.id = 'studio-scenes';
    } else {
      root = document.getElementById('studio-scenes');
    }
    if (!root) {
      root = document.createElement('aside');
      root.id = 'studio-scenes';
      root.setAttribute('data-region', 'scenes');
      root.setAttribute('aria-label', 'Scenes and sources');
      var host =
        document.querySelector('[data-region="scenes"]') ||
        document.querySelector('.stream-main') ||
        document.querySelector('.app') ||
        document.body;
      if (host && host !== root) {
        if (host.classList && host.classList.contains('stream-main')) {
          host.insertBefore(root, host.firstChild);
        } else {
          host.appendChild(root);
        }
      }
    }
    root.setAttribute('data-region', 'scenes');
    if (!root.getAttribute('aria-label')) {
      root.setAttribute('aria-label', 'Scenes and sources');
    }
    return root;
  }

  function buildShellMarkup() {
    if (root.querySelector('#studio-scenes-list')) return;

    root.innerHTML =
      '<div class="studio-block">' +
      '<header class="studio-block-head"><h2>Scenes</h2></header>' +
      '<ul class="studio-list studio-list--scenes" id="studio-scenes-list" aria-label="Scenes"></ul>' +
      '</div>' +
      '<div class="studio-block">' +
      '<header class="studio-block-head">' +
      '<h2>Sources</h2>' +
      '<button type="button" class="studio-icon-btn" id="btn-refresh-sources" title="Refresh capture lists" aria-label="Refresh capture lists">↻</button>' +
      '</header>' +
      '<ul class="studio-list studio-source-list" aria-label="Source types" id="studio-sources-list"></ul>' +
      '</div>' +
      '<footer class="studio-footer">' +
      '<span class="studio-status-dot" id="studio-status-dot" data-state="ok" aria-hidden="true"></span>' +
      '<span id="studio-status-text">All systems nominal</span>' +
      '</footer>';
  }

  function highlightSceneSelection(sceneId) {
    if (!scenesList) return;
    var buttons = scenesList.querySelectorAll('.studio-list-item[data-scene]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.dataset.active = btn.dataset.scene === sceneId ? '1' : '0';
      btn.setAttribute('aria-current', btn.dataset.scene === sceneId ? 'true' : 'false');
    }
  }

  function builtinButtonId(sceneId) {
    if (sceneId === 'gaming-cam') return 'scene-gameplay';
    if (sceneId === 'starting-soon') return 'scene-starting';
    if (sceneId === 'intermission') return 'scene-intermission';
    if (sceneId === 'ending') return 'scene-ending';
    return '';
  }

  function renderSceneList() {
    if (!scenesList) return;
    scenesList.innerHTML = '';

    scenes.forEach(function (scene) {
      var li = document.createElement('li');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'studio-list-item';
      btn.dataset.scene = scene.id;
      btn.dataset.active = scene.id === activeSceneId ? '1' : '0';
      var bid = builtinButtonId(scene.id);
      if (bid) btn.id = bid;
      btn.setAttribute('aria-current', scene.id === activeSceneId ? 'true' : 'false');

      var leading = document.createElement('span');
      leading.className = 'studio-list-leading scene-icon';
      leading.setAttribute('aria-hidden', 'true');
      leading.textContent = scene.icon || '▶';

      var text = document.createElement('span');
      text.className = 'studio-list-text';
      text.textContent = scene.name;

      var menu = document.createElement('span');
      menu.className = 'studio-list-menu studio-list-menu--static';
      menu.setAttribute('aria-hidden', 'true');
      menu.textContent = '⋯';

      btn.append(leading, text, menu);
      btn.addEventListener('click', function () {
        selectScene(scene.id);
      });

      li.appendChild(btn);
      scenesList.appendChild(li);
    });

    var downloadRow = document.createElement('li');
    downloadRow.id = 'studio-scenes-download-row';
    var downloadLink = document.createElement('a');
    downloadLink.className = 'studio-list-item studio-list-download';
    downloadLink.id = 'btn-scenes-download';
    downloadLink.href = DOWNLOAD_HREF;
    downloadLink.target = '_blank';
    downloadLink.rel = 'noopener noreferrer';
    downloadLink.title = DOWNLOAD_LABEL;
    downloadLink.setAttribute('aria-label', DOWNLOAD_LABEL);
    downloadLink.innerHTML =
      '<span class="studio-list-leading scene-icon" aria-hidden="true">↓</span>' +
      '<span class="studio-list-text">' +
      DOWNLOAD_LABEL +
      '</span>';
    downloadRow.appendChild(downloadLink);
    scenesList.appendChild(downloadRow);
  }

  function layerEnabledForKind(kind) {
    if (kind === 'game') return layers.game;
    if (kind === 'webcam') return layers.cam;
    if (kind === 'mic') return layers.mic;
    if (kind === 'browser') return layers.browser || layers.overlay;
    if (kind === 'chat') return layers.chat;
    if (kind === 'notifications') return layers.notifications;
    return false;
  }

  function syncSourceRows() {
    SOURCE_KINDS.forEach(function (kind) {
      var el = document.getElementById(SOURCE_META[kind].id);
      if (!el) return;
      el.dataset.enabled = layerEnabledForKind(kind) ? '1' : '0';
      el.dataset.active = sourceActive[kind] ? '1' : '0';
      el.setAttribute('aria-expanded', expandedSourceKind === kind ? 'true' : 'false');
      var menu = el.querySelector('[data-source-menu]');
      if (menu) menu.setAttribute('aria-expanded', expandedSourceKind === kind ? 'true' : 'false');
    });
  }

  function syncSourcePickerVisibility() {
    SOURCE_KINDS.forEach(function (kind) {
      var picker = document.getElementById(SOURCE_META[kind].picker);
      if (!picker) return;
      var open = expandedSourceKind === kind;
      picker.hidden = !open;
      if (open) renderSourcePicker(kind);
    });
    syncSourceRows();
  }

  function appendPickerStatus(picker, text) {
    var li = document.createElement('li');
    var p = document.createElement('p');
    p.className = 'studio-source-picker-status';
    p.textContent = text;
    li.appendChild(p);
    picker.appendChild(li);
  }

  function appendPickerSection(picker, title) {
    var li = document.createElement('li');
    li.className = 'studio-source-picker-section';
    var p = document.createElement('p');
    p.className = 'studio-source-picker-section-title';
    p.textContent = title;
    li.appendChild(p);
    picker.appendChild(li);
  }

  function appendPickerButton(picker, label, active, onPick) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'studio-source-picker-item';
    btn.dataset.active = active ? '1' : '0';
    btn.textContent = label;
    btn.addEventListener('click', onPick);
    li.appendChild(btn);
    picker.appendChild(li);
  }

  function renderSourcePicker(kind) {
    var picker = document.getElementById(SOURCE_META[kind].picker);
    if (!picker) return;
    picker.innerHTML = '';

    if (kind === 'game' || kind === 'webcam' || kind === 'mic') {
      appendPickerStatus(
        picker,
        kind === 'mic'
          ? 'Capture device lists are not available in this browser mock. Toggle the row to set visibility.'
          : 'Toggle the row to show/hide this layer. Start capture with Share screen / Add webcam on the program preview.',
      );
      appendPickerButton(picker, 'Mark as connected (mock)', !!sourceActive[kind], function () {
        sourceActive[kind] = !sourceActive[kind];
        if (sourceActive[kind]) {
          if (kind === 'game') layers.game = true;
          if (kind === 'webcam') layers.cam = true;
          if (kind === 'mic') layers.mic = true;
        }
        syncSourcePickerVisibility();
        emitAll();
      });
      return;
    }

    if (kind === 'browser') {
      appendPickerSection(picker, 'Layout presets');
      appendPickerButton(picker, 'Follow scene layout', !layers.overlay && !layers.browser, function () {
        layers.overlay = false;
        layers.browser = false;
        sourceActive.browser = false;
        syncSourcePickerVisibility();
        emitAll();
      });
      appendPickerButton(picker, 'Overlay on (mock)', !!(layers.overlay || layers.browser), function () {
        layers.overlay = true;
        sourceActive.browser = true;
        syncSourcePickerVisibility();
        emitAll();
      });
      appendPickerStatus(picker, 'Native search-tab overlay capture is desktop-only.');
      return;
    }

    if (kind === 'chat') {
      appendPickerButton(picker, 'Chat off', !layers.chat, function () {
        layers.chat = false;
        sourceActive.chat = false;
        syncSourcePickerVisibility();
        emitAll();
      });
      appendPickerButton(picker, 'Placeholder chat', layers.chat, function () {
        layers.chat = true;
        sourceActive.chat = true;
        syncSourcePickerVisibility();
        emitAll();
      });
      return;
    }

    if (kind === 'notifications') {
      appendPickerButton(picker, 'Notifications off', !layers.notifications, function () {
        layers.notifications = false;
        sourceActive.notifications = false;
        syncSourcePickerVisibility();
        emitAll();
      });
      appendPickerButton(picker, 'Placeholder overlay', layers.notifications, function () {
        layers.notifications = true;
        sourceActive.notifications = true;
        syncSourcePickerVisibility();
        emitAll();
      });
    }
  }

  function wireSourceToggle(kind, btn) {
    if (btn.dataset.scenesWired === '1') return;
    // Row body = layer on/off only. Capture lives on preview Share/Webcam buttons.
    if (!btn.title) {
      btn.title = 'Toggle layer visibility';
    }
    btn.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('[data-source-menu]')) return;
      toggleLayerForSourceKind(kind);
    });

    var menu = btn.querySelector('[data-source-menu]');
    if (menu) {
      function onMenu(event) {
        event.preventDefault();
        event.stopPropagation();
        toggleSourcePicker(kind);
      }
      menu.addEventListener('click', onMenu);
      menu.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        onMenu(event);
      });
    }
    btn.dataset.scenesWired = '1';
  }

  function renderSourcesList() {
    var list = document.getElementById('studio-sources-list');
    if (!list) {
      list = root.querySelector('.studio-source-list');
      if (!list) return;
      if (!list.id) list.id = 'studio-sources-list';
    }
    if (list.children.length && list.querySelector('.studio-source-toggle')) {
      SOURCE_KINDS.forEach(function (kind) {
        var meta = SOURCE_META[kind];
        var btn = document.getElementById(meta.id);
        var picker = document.getElementById(meta.picker);
        if (btn) wireSourceToggle(kind, btn);
        if (!picker && btn && btn.parentElement) {
          picker = document.createElement('ul');
          picker.className = 'studio-source-picker';
          picker.id = meta.picker;
          picker.hidden = true;
          picker.setAttribute('role', 'list');
          btn.parentElement.appendChild(picker);
        }
      });
      syncSourcePickerVisibility();
      return;
    }

    list.innerHTML = '';
    SOURCE_KINDS.forEach(function (kind) {
      var meta = SOURCE_META[kind];
      var li = document.createElement('li');
      li.className = 'studio-source-group';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'studio-list-item studio-source-toggle';
      btn.id = meta.id;
      btn.dataset.sourceKind = kind;
      btn.setAttribute('aria-controls', meta.picker);

      var leading = document.createElement('span');
      leading.className = 'studio-list-leading source-icon';
      leading.setAttribute('aria-hidden', 'true');
      leading.textContent = meta.icon;

      var text = document.createElement('span');
      text.className = 'studio-list-text';
      text.textContent = meta.label;

      var menu = document.createElement('span');
      menu.setAttribute('role', 'button');
      menu.tabIndex = 0;
      menu.className = 'studio-list-menu';
      menu.dataset.sourceMenu = kind;
      menu.setAttribute('aria-label', meta.menuLabel);
      menu.title = meta.menuLabel;
      menu.textContent = '⋯';

      btn.append(leading, text, menu);

      var picker = document.createElement('ul');
      picker.className = 'studio-source-picker';
      picker.id = meta.picker;
      picker.hidden = true;
      picker.setAttribute('role', 'list');
      picker.setAttribute('aria-label', meta.label);

      li.append(btn, picker);
      list.appendChild(li);
      wireSourceToggle(kind, btn);
    });

    var refresh = document.getElementById('btn-refresh-sources');
    if (refresh && refresh.dataset.scenesWired !== '1') {
      refresh.addEventListener('click', function () {
        if (expandedSourceKind) renderSourcePicker(expandedSourceKind);
        var status = document.getElementById('studio-status-text');
        if (status) status.textContent = 'Source lists refreshed (mock)';
        setTimeout(function () {
          if (status) status.textContent = 'All systems nominal';
        }, 1600);
      });
      refresh.dataset.scenesWired = '1';
    }

    syncSourcePickerVisibility();
  }

  function toggleSourcePicker(kind) {
    expandedSourceKind = expandedSourceKind === kind ? null : kind;
    syncSourcePickerVisibility();
  }

  function toggleLayerForSourceKind(kind) {
    if (kind === 'game') {
      layers.game = !layers.game;
    } else if (kind === 'webcam') {
      layers.cam = !layers.cam;
    } else if (kind === 'mic') {
      layers.mic = !layers.mic;
    } else if (kind === 'browser') {
      var showing = layers.browser || layers.overlay;
      if (showing) {
        layers.overlay = false;
        layers.browser = false;
        sourceActive.browser = false;
      } else {
        layers.overlay = true;
        sourceActive.browser = true;
      }
    } else if (kind === 'chat') {
      layers.chat = !layers.chat;
      sourceActive.chat = layers.chat;
    } else if (kind === 'notifications') {
      layers.notifications = !layers.notifications;
      sourceActive.notifications = layers.notifications;
    }
    syncSourceRows();
    emitAll();
  }

  function selectScene(sceneId) {
    if (!findScene(sceneId)) return;
    activeSceneId = sceneId;
    applySceneLayerDefaults(sceneId);
    highlightSceneSelection(sceneId);
    syncSourceRows();
    emitAll();
  }

  function api() {
    return {
      getState: function () {
        return {
          scenes: scenes.map(cloneScene),
          activeSceneId: activeSceneId,
          layers: Object.assign({}, layers),
          sourceActive: Object.assign({}, sourceActive),
        };
      },
      selectScene: selectScene,
      /** @deprecated Custom scenes removed — no-op for back-compat. */
      addScene: function () {
        return null;
      },
      /** @deprecated Custom scenes removed — no-op for back-compat. */
      deleteScene: function () {
        return false;
      },
      toggleSource: toggleLayerForSourceKind,
      refresh: function () {
        renderSceneList();
        renderSourcesList();
        syncSourceRows();
      },
      root: function () {
        return root;
      },
    };
  }

  function initScenes(mount) {
    loadState();
    ensureRoot(mount || null);
    buildShellMarkup();
    scenesList = document.getElementById('studio-scenes-list') || root.querySelector('#studio-scenes-list');
    if (!scenesList) return api();

    applySceneLayerDefaults(activeSceneId);
    renderSceneList();
    renderSourcesList();
    highlightSceneSelection(activeSceneId);
    syncSourceRows();
    emitAll();
    booted = true;
    global.MakaScenes = api();
    return global.MakaScenes;
  }

  global.initScenes = initScenes;

  function autoBoot() {
    if (booted) return;
    if (typeof document === 'undefined') return;
    initScenes();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoBoot);
    } else {
      autoBoot();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);

export function initScenes(mount) {
  if (typeof window !== 'undefined' && typeof window.initScenes === 'function') {
    return window.initScenes(mount);
  }
  return null;
}
